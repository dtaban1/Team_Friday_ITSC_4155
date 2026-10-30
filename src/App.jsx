import { Navigate, Route, Routes } from "react-router-dom";
import Home from "./pages/Home.jsx";
import Login from "./pages/Login.jsx";
import Signup from "./pages/Signup.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import HabitManagement from "./pages/HabitManagement.jsx";
import Rewards from "./pages/Rewards.jsx";
import HabitHistory from "./pages/HabitHistory.jsx";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/rewards" element={<Rewards />} />
      <Route path="/habits/history" element={<HabitHistory />} />
      <Route path="/habits/manage" element={<HabitManagement />} />
      <Route path="/habits" element={<Navigate to="/dashboard#habits" replace />} />
    </Routes>
  );
}

export default App;
