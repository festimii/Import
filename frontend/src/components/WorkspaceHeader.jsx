import LogoutRoundedIcon from "@mui/icons-material/LogoutRounded";
import ManageAccountsRoundedIcon from "@mui/icons-material/ManageAccountsRounded";
import {
  AppBar,
  Avatar,
  Box,
  Button,
  Chip,
  Stack,
  Toolbar,
  Typography,
} from "@mui/material";

const WorkspaceHeader = ({
  title,
  subtitle,
  actions,
  showManageUsers = false,
  onManageUsers,
  onLogout,
}) => {
  const username = localStorage.getItem("username") ?? "Team member";
  const role = localStorage.getItem("role") ?? "guest";

  const initials = username
    .split(" ")
    .map((part) => part.charAt(0).toUpperCase())
    .join("")
    .slice(0, 2);

  return (
    <AppBar
      position="static"
      elevation={0}
      sx={{
        borderRadius: { xs: 3, md: 4 },
        background: "linear-gradient(135deg, rgba(27,75,145,0.95), rgba(46,184,138,0.85))",
        color: "common.white",
        px: { xs: 2, md: 4 },
        py: { xs: 2, md: 2.5 },
      }}
    >
      <Toolbar disableGutters sx={{ width: "100%" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={{ xs: 2, md: 4 }}
          alignItems={{ xs: "flex-start", md: "center" }}
          sx={{ flexGrow: 1 }}
        >
          <Stack spacing={0.5}>
            <Chip
              label="Import Management"
              sx={{
                alignSelf: "flex-start",
                backgroundColor: "rgba(255,255,255,0.12)",
                color: "inherit",
                fontWeight: 600,
              }}
            />
            <Typography variant="h5" component="h1" fontWeight={600}>
              {title}
            </Typography>
            {subtitle && (
              <Typography variant="body2" sx={{ opacity: 0.85 }}>
                {subtitle}
              </Typography>
            )}
          </Stack>

          <Stack
            direction={{ xs: "column", sm: "row" }}
            spacing={2}
            alignItems={{ xs: "flex-start", sm: "center" }}
          >
            <Stack direction="row" spacing={1.5} alignItems="center">
              <Avatar
                sx={{
                  bgcolor: "rgba(255,255,255,0.2)",
                  color: "common.white",
                  fontWeight: 600,
                }}
              >
                {initials || "IM"}
              </Avatar>
              <Box>
                <Typography variant="subtitle2" sx={{ opacity: 0.8 }}>
                  Signed in as
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {username}
                </Typography>
                <Chip
                  size="small"
                  label={role}
                  sx={{
                    mt: 0.5,
                    backgroundColor: "rgba(255,255,255,0.18)",
                    color: "inherit",
                    textTransform: "capitalize",
                  }}
                />
              </Box>
            </Stack>

            <Stack direction="row" spacing={1.5}>
              {showManageUsers && (
                <Button
                  variant="outlined"
                  color="inherit"
                  startIcon={<ManageAccountsRoundedIcon />}
                  onClick={onManageUsers}
                >
                  Manage users
                </Button>
              )}
              {actions}
              {onLogout && (
                <Button
                  variant="contained"
                  color="inherit"
                  startIcon={<LogoutRoundedIcon />}
                  onClick={onLogout}
                  sx={{ color: "primary.main" }}
                >
                  Logout
                </Button>
              )}
            </Stack>
          </Stack>
        </Stack>
      </Toolbar>
    </AppBar>
  );
};

export default WorkspaceHeader;
