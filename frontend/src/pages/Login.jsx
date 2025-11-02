import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import {
  Alert,
  Box,
  Button,
  FormControlLabel,
  IconButton,
  InputAdornment,
  Link,
  Stack,
  Switch,
  TextField,
} from "@mui/material";
import VisibilityRoundedIcon from "@mui/icons-material/VisibilityRounded";
import VisibilityOffRoundedIcon from "@mui/icons-material/VisibilityOffRounded";
import AuthLayout from "../components/AuthLayout";
import API from "../api";

export default function Login() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [staySignedIn, setStaySignedIn] = useState(true);

  const handleLogin = async (event) => {
    event.preventDefault();
    setError("");
    try {
      const res = await API.post("/auth/login", { username, password });
      localStorage.setItem("token", res.data.token);
      localStorage.setItem("role", res.data.role);
      if (staySignedIn) {
        localStorage.setItem("remember", "true");
      } else {
        localStorage.removeItem("remember");
      }
      window.location.href = "/";
    } catch {
      setError("We couldn't find a match for that username and password.");
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to manage import requests, collaborate with approvers and keep deliveries on track."
      footer={
        <Stack spacing={1} textAlign="center">
          <Link component={RouterLink} to="/register" underline="hover">
            Create a new account
          </Link>
          <Link underline="hover" color="text.secondary" sx={{ cursor: "pointer" }}>
            Forgot your password?
          </Link>
        </Stack>
      }
    >
      <Box component="form" onSubmit={handleLogin} noValidate>
        <Stack spacing={3}>
          {error && <Alert severity="error">{error}</Alert>}

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
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            required
            fullWidth
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((prev) => !prev)}
                    edge="end"
                  >
                    {showPassword ? <VisibilityOffRoundedIcon /> : <VisibilityRoundedIcon />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={staySignedIn}
                onChange={(event) => setStaySignedIn(event.target.checked)}
                color="primary"
              />
            }
            label="Keep me signed in on this device"
          />

          <Button type="submit" variant="contained" size="large">
            Sign in
          </Button>
        </Stack>
      </Box>
    </AuthLayout>
  );
}
