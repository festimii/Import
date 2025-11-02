import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import DashboardRoundedIcon from "@mui/icons-material/DashboardRounded";
import EventAvailableRoundedIcon from "@mui/icons-material/EventAvailableRounded";
import NotificationsActiveRoundedIcon from "@mui/icons-material/NotificationsActiveRounded";
import {
  Alert,
  Button,
  Link,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import API from "../api";
import AuthLayout from "../components/AuthLayout";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const highlights = useMemo(
    () => [
      {
        icon: <DashboardRoundedIcon fontSize="small" />,
        label: "Access role-tailored dashboards instantly",
      },
      {
        icon: <EventAvailableRoundedIcon fontSize="small" />,
        label: "Sync arrival schedules with one glance",
      },
      {
        icon: <NotificationsActiveRoundedIcon fontSize="small" />,
        label: "Stay alerted to approvals and updates in real time",
      },
    ],
    []
  );

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const res = await API.post("/auth/login", { username, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.role);
      localStorage.setItem("username", res.data.username ?? username);
      window.location.href = "/";
    } catch {
      setError("We couldn't find a match for that username and password.");
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to keep import requests, confirmations and schedules aligned across your team."
      highlights={highlights}
    >
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Typography variant="h4" component="h2">
            Sign in
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Enter your credentials to access the requester, confirmer or admin workspace.
          </Typography>
        </Stack>

        {error && <Alert severity="error">{error}</Alert>}

        <Stack component="form" onSubmit={handleLogin} noValidate spacing={3}>
          <TextField
            label="Username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            autoComplete="username"
            required
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            fullWidth
          />
          <Button type="submit" variant="contained" size="large" fullWidth>
            Sign in
          </Button>
        </Stack>

        <Typography variant="body2" textAlign="center">
          New to the platform?{" "}
          <Link component={RouterLink} to="/register" underline="hover">
            Create an account
          </Link>
        </Typography>
      </Stack>
    </AuthLayout>
  );
}
