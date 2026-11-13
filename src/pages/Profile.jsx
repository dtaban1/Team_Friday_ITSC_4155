import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/profile.css";

const API = "http://localhost:5000/api/profile";
const MAX_BYTES = 2 * 1024 * 1024;
const TYPES = ["image/png", "image/jpeg", "image/webp"];

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("Could not read file."));
    reader.readAsDataURL(file);
  });
}

function Profile() {
  const navigate = useNavigate();
  const fileInput = useRef(null);
  const [form, setForm] = useState({ firstName: "", lastName: "", bio: "" });
  const [email, setEmail] = useState("");
  const [picture, setPicture] = useState(null); // saved picture (data URL)
  const [pendingPicture, setPendingPicture] = useState(null); // chosen, not saved yet
  const [removePicture, setRemovePicture] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch(API, { credentials: "include" });
        if (response.status === 401) {
          navigate("/login", { replace: true });
          return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.message);
        if (cancelled) return;
        setForm({ firstName: data.firstName, lastName: data.lastName, bio: data.bio });
        setEmail(data.email);
        setPicture(data.picture);
      } catch (err) {
        if (!cancelled) setError(err.message || "Could not load profile.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    setMessage("");
  };

  const handleFile = async (event) => {
    const file = event.target.files[0];
    event.target.value = "";
    if (!file) return;
    if (!TYPES.includes(file.type)) {
      setError("Choose a PNG, JPEG or WebP picture.");
      return;
    }
    if (file.size > MAX_BYTES) {
      setError("Choose a picture up to 2 MB.");
      return;
    }
    try {
      setPendingPicture(await readAsDataUrl(file));
      setRemovePicture(false);
      setError("");
      setMessage("");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRemove = () => {
    setPendingPicture(null);
    setRemovePicture(true);
    setMessage("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    setMessage("");
    setSaving(true);
    try {
      const patch = await fetch(API, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const patchData = await patch.json();
      if (!patch.ok) throw new Error(patchData.message);

      if (pendingPicture) {
        const put = await fetch(`${API}/picture`, {
          method: "PUT",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ picture: pendingPicture }),
        });
        const putData = await put.json();
        if (!put.ok) throw new Error(putData.message);
        setPicture(putData.picture);
        setPendingPicture(null);
      } else if (removePicture) {
        const del = await fetch(`${API}/picture`, {
          method: "DELETE",
          credentials: "include",
        });
        if (!del.ok) throw new Error("Could not remove picture.");
        setPicture(null);
        setRemovePicture(false);
      }
      setMessage("Profile saved.");
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const shown = pendingPicture || (removePicture ? null : picture);
  const initials =
    `${form.firstName[0] || ""}${form.lastName[0] || ""}`.toUpperCase() || "?";

  if (loading) {
    return (
      <main className="profile-page">
        <p className="profile-loading">Loading profile…</p>
      </main>
    );
  }

  return (
    <main className="profile-page">
      <section className="profile-card">
        <Link className="profile-back" to="/dashboard">
          ← Back to dashboard
        </Link>
        <h1>Your profile</h1>
        {email && <p className="profile-email">{email}</p>}

        <form className="profile-form" onSubmit={handleSubmit}>
          <div className="profile-avatar-row">
            <div className="profile-avatar">
              {shown ? <img src={shown} alt="Profile" /> : <span>{initials}</span>}
            </div>
            <div className="profile-avatar-actions">
              <input
                ref={fileInput}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleFile}
                hidden
              />
              <button
                type="button"
                className="profile-button-secondary"
                onClick={() => fileInput.current.click()}
              >
                Choose picture
              </button>
              {shown && (
                <button
                  type="button"
                  className="profile-button-secondary"
                  onClick={handleRemove}
                >
                  Remove
                </button>
              )}
              <span className="profile-hint">PNG, JPEG or WebP, up to 2 MB.</span>
            </div>
          </div>

          <div className="profile-field">
            <label htmlFor="profile-first-name">First name</label>
            <input
              id="profile-first-name"
              name="firstName"
              value={form.firstName}
              onChange={handleChange}
              maxLength={50}
              required
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-last-name">Last name</label>
            <input
              id="profile-last-name"
              name="lastName"
              value={form.lastName}
              onChange={handleChange}
              maxLength={50}
              required
            />
          </div>

          <div className="profile-field">
            <label htmlFor="profile-bio">Bio</label>
            <textarea
              id="profile-bio"
              name="bio"
              rows={4}
              value={form.bio}
              onChange={handleChange}
              maxLength={500}
              placeholder="Tell us a little about yourself"
            />
            <span className="profile-hint">{form.bio.length}/500</span>
          </div>

          {error && (
            <p className="profile-error" role="alert">
              {error}
            </p>
          )}
          {message && <p className="profile-success">{message}</p>}

          <button className="profile-button" type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save profile"}
          </button>
        </form>
      </section>
    </main>
  );
}

export default Profile;
