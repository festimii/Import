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

  return (
    <Card elevation={6} sx={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <CardContent sx={{ flexGrow: 1 }}>
        <Stack spacing={1.5}>
          <Box>
            <Typography variant="overline" color="primary" sx={{ letterSpacing: 1 }}>
              Request #{req.ID}
            </Typography>
            <Typography variant="h6">{articleValue}</Typography>
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
            <Typography variant="body1">{formattedRequestDate}</Typography>
          </Stack>
          <Stack spacing={0.5}>
            <Typography variant="subtitle2" color="text.secondary">
              Arrival date (Data Arritjes)
            </Typography>
            <Typography variant="body1">{formattedArrivalDate}</Typography>
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
      <CardActions
        sx={{
          px: 3,
          pb: 3,
          display: "flex",
          flexWrap: "wrap",
          gap: 1.5,
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
          >
            Approve
          </Button>
        </Box>
      </CardActions>
    </Card>
  );
}
