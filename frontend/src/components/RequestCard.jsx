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
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import formatArticleCode from "../utils/formatArticle";

export default function RequestCard({ req, onDecision, onProposeDate }) {
  let formattedRequestDate = "N/A";
  if (req.RequestDate) {
    const date = new Date(req.RequestDate);
    if (!Number.isNaN(date.getTime())) {
      formattedRequestDate = date.toLocaleDateString();
    } else if (typeof req.RequestDate === "string") {
      formattedRequestDate = req.RequestDate;
    }
  }

  let formattedArrivalDate = "N/A";
  if (req.ArrivalDate) {
    const date = new Date(req.ArrivalDate);
    if (!Number.isNaN(date.getTime())) {
      formattedArrivalDate = date.toLocaleDateString();
    } else if (typeof req.ArrivalDate === "string") {
      formattedArrivalDate = req.ArrivalDate;
    }
  }

  const articleValue = formatArticleCode(req.Article);

  const status = (req.Status ?? "pending").toLowerCase();
  const statusConfig = {
    approved: { label: "Approved", color: "success" },
    rejected: { label: "Rejected", color: "error" },
    pending: { label: "Pending", color: "warning" },
  };
  const { label, color } = statusConfig[status] ?? {
    label: req.Status ?? "Pending",
    color: "default",
  };

  return (
    <Card
      elevation={0}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background:
          "linear-gradient(160deg, rgba(27,75,145,0.06) 0%, rgba(255,255,255,0.95) 40%, rgba(46,184,138,0.08) 100%)",
        border: "1px solid rgba(27, 75, 145, 0.12)",
        boxShadow:
          "0px 18px 35px -20px rgba(27,75,145,0.45), 0px 12px 22px -18px rgba(46,184,138,0.28)",
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Stack spacing={2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center">
            <Box>
              <Typography variant="overline" color="primary" sx={{ letterSpacing: 1 }}>
                Request #{req.ID}
              </Typography>
              <Typography variant="h6">{articleValue}</Typography>
            </Box>
            <Chip label={label} color={color} variant={color === "default" ? "outlined" : "filled"} />
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="text.secondary">
              Importer
            </Typography>
            <Typography variant="body1">{req.Importer}</Typography>
          </Stack>
          <Stack spacing={0.5} direction="row" justifyContent="space-between">
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Request date
              </Typography>
              <Typography variant="body1">{formattedRequestDate}</Typography>
            </Box>
            <Box>
              <Typography variant="subtitle2" color="text.secondary">
                Arrival date
              </Typography>
              <Typography variant="body1">{formattedArrivalDate}</Typography>
            </Box>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="text.secondary">
              Number of pallets
            </Typography>
            <Typography variant="body1">{req.PalletCount ?? "N/A"}</Typography>
          </Stack>
          <Divider sx={{ my: 1.5 }} />
          <Typography variant="body2" color="text.secondary">
            Requested by <Typography component="span" fontWeight={600}>{req.Requester}</Typography>
          </Typography>
        </Stack>
      </CardContent>
      <CardActions
        sx={{
          px: 3,
          pb: 3,
          display: "flex",
          flexWrap: "wrap",
          gap: 1,
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        {onProposeDate && (
          <Button
            variant="text"
            color="secondary"
            startIcon={<EventRepeatRoundedIcon />}
            onClick={() => onProposeDate(req)}
          >
            Propose new date
          </Button>
        )}
        <Box sx={{ display: "flex", gap: 1 }}>
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
            sx={{ boxShadow: "none" }}
          >
            Approve
          </Button>
        </Box>
      </CardActions>
    </Card>
  );
}
