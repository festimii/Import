import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Chip,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

export default function RequestCard({ req, onDecision }) {
  let items = [];
  try {
    const parsed = JSON.parse(req.Items);
    if (Array.isArray(parsed)) {
      items = parsed;
    }
  } catch (error) {
    items = [];
  }

  return (
    <Card elevation={6} sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" color="primary" sx={{ letterSpacing: 1 }}>
              Request #{req.ID}
            </Typography>
            <Typography variant="h6">{req.Description}</Typography>
          </Box>
          <Stack spacing={1}>
            <Typography variant="subtitle2" color="text.secondary">
              Requested items
            </Typography>
            <Stack direction="row" flexWrap="wrap" gap={1}>
              {items.length > 0 ? (
                items.map((item) => <Chip key={item} label={item} color="secondary" />)
              ) : (
                <Chip label="No items listed" variant="outlined" />
              )}
            </Stack>
          </Stack>
          <Divider sx={{ my: 1 }} />
          <Typography variant="body2" color="text.secondary">
            Requested by <Typography component="span" fontWeight={600}>{req.Requester}</Typography>
          </Typography>
        </Stack>
      </CardContent>
      <CardActions sx={{ justifyContent: "space-between", px: 3, pb: 3 }}>
        <Button
          variant="outlined"
          color="error"
          startIcon={<CloseRoundedIcon />}
          onClick={() => onDecision(req.ID, "rejected")}
        >
          Reject
        </Button>
        <Button
          variant="contained"
          color="secondary"
          startIcon={<CheckRoundedIcon />}
          onClick={() => onDecision(req.ID, "approved")}
        >
          Approve
        </Button>
      </CardActions>
    </Card>
  );
}
