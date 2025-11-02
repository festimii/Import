import { useMemo, useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import GroupAddRoundedIcon from "@mui/icons-material/GroupAddRounded";
import AdminPanelSettingsRoundedIcon from "@mui/icons-material/AdminPanelSettingsRounded";
import TimelineRoundedIcon from "@mui/icons-material/TimelineRounded";
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

export default function Register() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [feedback, setFeedback] = useState(null);

  const highlights = useMemo(
    () => [
      {
        icon: <GroupAddRoundedIcon fontSize="small" />,
        label: "Onboard colleagues with just a few clicks",
      },
      {
        icon: <AdminPanelSettingsRoundedIcon fontSize="small" />,
        label: "Assign precise permissions from day one",
      },
      {
        icon: <TimelineRoundedIcon fontSize="small" />,
        label: "Give teams visibility into confirmed arrival timelines",
      },
    ],
    []
  );

  const handleRegister = async (event) => {
    event.preventDefault();

    if (password !== confirm) {
      setFeedback({
        severity: "error",
        message: "Passwords do not match. Please try again.",
      });
      return;
    }

    try {
      await API.post("/auth/register", { username, password });
      setFeedback({
        severity: "success",
        message: "Account created! Redirecting you to sign in...",
      });
      setTimeout(() => (window.location.href = "/"), 1500);
    } catch (error) {
      setFeedback({
        severity: "error",
        message: "Registration failed. That username may already be taken.",
      });
    }
  };

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Invite your team to coordinate arrivals, approvals and stakeholder updates in one place."
      highlights={highlights}
    >
      <Stack spacing={4}>
        <Stack spacing={1}>
          <Typography variant="h4" component="h2">
            Register
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Set up access to the import management hub in just a few steps.
          </Typography>
        </Stack>

        {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}

        <Stack component="form" onSubmit={handleRegister} noValidate spacing={3}>
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
            autoComplete="new-password"
            required
            fullWidth
          />
          <TextField
            label="Confirm password"
            type="password"
            value={confirm}
            onChange={(event) => setConfirm(event.target.value)}
            autoComplete="new-password"
            required
            fullWidth
          />
          <Button type="submit" variant="contained" size="large" fullWidth>
            Register
          </Button>
        </Stack>

        <Typography variant="body2" textAlign="center">
          Already have an account?{" "}
          <Link component={RouterLink} to="/" underline="hover">
            Sign in here
          </Link>
        </Typography>
      </Stack>
    </AuthLayout>
  );
}
