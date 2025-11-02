import { alpha, useTheme } from "@mui/material/styles";
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
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import formatArticleCode from "../utils/formatArticle";

export default function RequestCard({ req, onDecision, onProposeDate }) {
  const theme = useTheme();
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
  const statusLabel = req.Status ? req.Status : "pending";

  return (
    <Card
      elevation={12}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 4,
        background: `linear-gradient(150deg, ${alpha(theme.palette.background.paper, 0.9)} 0%, ${alpha(
          theme.palette.primary.main,
          0.05
        )} 100%)`,
        border: `1px solid ${alpha(theme.palette.primary.main, 0.12)}`,
      }}
    >
      <CardContent sx={{ flexGrow: 1 }}>
        <Stack spacing={2}>
          <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box
              sx={{
                width: 48,
                height: 48,
                borderRadius: 3,
                backgroundColor: alpha(theme.palette.secondary.main, 0.12),
                color: theme.palette.secondary.main,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 26,
              }}
            >
              <LocalShippingRoundedIcon />
            </Box>
            <Stack spacing={0.5}>
              <Typography variant="overline" color="primary" sx={{ letterSpacing: 1 }}>
                Request #{req.ID}
              </Typography>
              <Typography variant="h6">{articleValue}</Typography>
            </Stack>
            <Chip
              label={statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}
              size="small"
              sx={{ marginLeft: "auto", backgroundColor: alpha(theme.palette.primary.main, 0.08) }}
            />
          </Stack>

          <Divider sx={{ my: 1 }} />

          <Stack spacing={1.5}>
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Importer
              </Typography>
              <Typography variant="body1">{req.Importer}</Typography>
            </Stack>
            <Stack spacing={0.5} direction={{ xs: "column", sm: "row" }} gap={{ sm: 6 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Request date
                </Typography>
                <Typography variant="body1">{formattedRequestDate}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Arrival date (Data Arritjes)
                </Typography>
                <Typography variant="body1">{formattedArrivalDate}</Typography>
              </Box>
            </Stack>
            <Stack spacing={0.5} direction={{ xs: "column", sm: "row" }} gap={{ sm: 6 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Number of pallets
                </Typography>
                <Typography variant="body1">{req.PalletCount ?? "N/A"}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Requested by
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {req.Requester}
                </Typography>
              </Box>
            </Stack>
          </Stack>
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
          borderTop: `1px solid ${alpha(theme.palette.primary.main, 0.08)}`,
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
