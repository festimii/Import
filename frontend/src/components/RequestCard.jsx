import {
  Box,
  Button,
  Card,
  CardActions,
  CardContent,
  Divider,
  Stack,
  Typography,
} from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";

export default function RequestCard({ req, onDecision }) {
  let formattedDate = "N/A";
  if (req.RequestDate) {
    const date = new Date(req.RequestDate);
    if (!Number.isNaN(date.getTime())) {
      formattedDate = date.toLocaleDateString();
    } else if (typeof req.RequestDate === "string") {
      formattedDate = req.RequestDate;
    }
  }

  return (
    <Card elevation={6} sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" color="primary" sx={{ letterSpacing: 1 }}>
              Request #{req.ID}
            </Typography>
            <Typography variant="h6">{req.Article}</Typography>
          </Box>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="text.secondary">
              Importer
            </Typography>
            <Typography variant="body1">{req.Importer}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="text.secondary">
              Request date
            </Typography>
            <Typography variant="body1">{formattedDate}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="text.secondary">
              Number of pallets
            </Typography>
            <Typography variant="body1">{req.PalletCount ?? "N/A"}</Typography>
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
