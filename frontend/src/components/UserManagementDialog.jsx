import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";

const UserManagementDialog = ({
  open,
  onClose,
  users,
  loading,
  feedback,
  onReload,
  onRoleChange,
  updatingUser,
}) => (
  <Dialog
    open={open}
    onClose={onClose}
    fullWidth
    maxWidth="md"
    aria-labelledby="user-management-dialog-title"
  >
    <DialogTitle id="user-management-dialog-title">
      User management
    </DialogTitle>
    <DialogContent dividers>
      <Stack spacing={3}>
        <Typography variant="body2" color="text.secondary">
          Adjust workspace permissions. Only administrators can change team
          member roles.
        </Typography>
        {feedback && <Alert severity={feedback.severity}>{feedback.message}</Alert>}
        {loading ? (
          <Box sx={{ display: "flex", justifyContent: "center", py: 4 }}>
            <CircularProgress color="primary" />
          </Box>
        ) : users.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No users found.
          </Typography>
        ) : (
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Username</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Role</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {users.map((user) => {
                  const labelId = `role-select-${encodeURIComponent(
                    user.Username
                  )}`;
                  return (
                    <TableRow key={user.Username}>
                      <TableCell>{user.Username}</TableCell>
                      <TableCell>
                        <FormControl size="small" fullWidth>
                          <InputLabel id={labelId}>Role</InputLabel>
                          <Select
                            labelId={labelId}
                            label="Role"
                            value={user.Role}
                            onChange={(event) =>
                              onRoleChange(user.Username, event.target.value)
                            }
                            disabled={updatingUser === user.Username}
                          >
                            <MenuItem value="requester">Requester</MenuItem>
                            <MenuItem value="confirmer">Confirmer</MenuItem>
                            <MenuItem value="planogram">Planogram</MenuItem>
                            <MenuItem value="admin">Admin</MenuItem>
                          </Select>
                        </FormControl>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Stack>
    </DialogContent>
    <DialogActions sx={{ px: 3, py: 2 }}>
      <Button onClick={onReload} disabled={loading}>
        Refresh
      </Button>
      <Button onClick={onClose} variant="contained" color="primary">
        Close
      </Button>
    </DialogActions>
  </Dialog>
);

export default UserManagementDialog;
