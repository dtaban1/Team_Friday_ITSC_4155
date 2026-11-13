const express = require("express");

const MAX_PICTURE_BYTES = 2 * 1024 * 1024;

// Check the real file bytes, not just what the browser claims the type is.
const PICTURE_CHECKS = {
  "image/png": (b) =>
    b.length > 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47,
  "image/jpeg": (b) =>
    b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  "image/webp": (b) =>
    b.length > 12 &&
    b.toString("ascii", 0, 4) === "RIFF" &&
    b.toString("ascii", 8, 12) === "WEBP",
};

function requireSession(req, res, next) {
  if (!req.session || !req.session.userId) {
    return res.status(401).json({ message: "Please log in." });
  }
  next();
}

function createProfileRouter(pool) {
  const router = express.Router();
  router.use(requireSession);

  router.get("/", async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT email, first_name, last_name, bio, profile_picture, profile_picture_type
         FROM users WHERE id = ?`,
        [req.session.userId]
      );
      if (!rows.length) return res.status(404).json({ message: "User not found." });
      const u = rows[0];
      const picture =
        u.profile_picture && u.profile_picture_type
          ? `data:${u.profile_picture_type};base64,${Buffer.from(u.profile_picture).toString("base64")}`
          : null;
      res.json({
        email: u.email,
        firstName: u.first_name || "",
        lastName: u.last_name || "",
        bio: u.bio || "",
        picture,
      });
    } catch (error) {
      console.error("Load profile failed:", error);
      res.status(500).json({ message: "Could not load profile." });
    }
  });

  router.patch("/", async (req, res) => {
    const body = req.body || {};
    const firstName = String(body.firstName ?? "").trim();
    const lastName = String(body.lastName ?? "").trim();
    const bio = String(body.bio ?? "").trim();

    if (firstName.length < 1 || firstName.length > 50) {
      return res.status(400).json({ message: "First name must be 1-50 characters." });
    }
    if (lastName.length < 1 || lastName.length > 50) {
      return res.status(400).json({ message: "Last name must be 1-50 characters." });
    }
    if (bio.length > 500) {
      return res.status(400).json({ message: "Bio must be 500 characters or fewer." });
    }

    try {
      await pool.query(
        "UPDATE users SET first_name = ?, last_name = ?, bio = ? WHERE id = ?",
        [firstName, lastName, bio || null, req.session.userId]
      );
      res.json({ firstName, lastName, bio });
    } catch (error) {
      console.error("Update profile failed:", error);
      res.status(500).json({ message: "Could not save profile." });
    }
  });

  router.put("/picture", async (req, res) => {
    const body = req.body || {};
    const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(
      String(body.picture || "")
    );
    if (!match) {
      return res.status(400).json({ message: "Choose a PNG, JPEG or WebP picture." });
    }
    const type = match[1];
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > MAX_PICTURE_BYTES) {
      return res.status(413).json({ message: "Choose a picture up to 2 MB." });
    }
    if (!PICTURE_CHECKS[type](bytes)) {
      return res.status(400).json({ message: "That file is not a valid image." });
    }

    try {
      await pool.query(
        "UPDATE users SET profile_picture = ?, profile_picture_type = ? WHERE id = ?",
        [bytes, type, req.session.userId]
      );
      res.json({ picture: `data:${type};base64,${match[2]}` });
    } catch (error) {
      console.error("Save picture failed:", error);
      res.status(500).json({ message: "Could not save picture." });
    }
  });

  router.delete("/picture", async (req, res) => {
    try {
      await pool.query(
        "UPDATE users SET profile_picture = NULL, profile_picture_type = NULL WHERE id = ?",
        [req.session.userId]
      );
      res.json({ picture: null });
    } catch (error) {
      console.error("Remove picture failed:", error);
      res.status(500).json({ message: "Could not remove picture." });
    }
  });

  return router;
}

module.exports = { createProfileRouter };
