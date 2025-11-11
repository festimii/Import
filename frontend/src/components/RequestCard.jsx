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
import { formatArticleLabel } from "../utils/formatArticle";

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

  const articleValue = formatArticleLabel(req.Article, req.ArticleName);
  const statusLabel = req.Status ? req.Status : "pending";

  const formatQuantity = (value, fractionDigits = 0) => {
    if (value === null || value === undefined) return "N/A";
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "N/A";
    return numericValue.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    });
  };

  const formatPercent = (value, fractionDigits = 1) => {
    if (value === null || value === undefined) return "N/A";
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return "N/A";
    return `${numericValue.toLocaleString(undefined, {
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    })}%`;
  };

  const renderMetricGrid = (metrics) => {
    const filtered = metrics.filter((metric) => metric.value !== "N/A");
    if (filtered.length === 0) {
      return (
        <Typography variant="body2" color="text.secondary">
          No data available.
        </Typography>
      );
    }

    return (
      <Box
        sx={{
          display: "flex",
          flexWrap: "wrap",
          gap: 2,
        }}
      >
        {filtered.map((metric) => (
          <Box
            key={metric.label}
            sx={{ minWidth: { xs: "100%", sm: "45%", md: "30%" } }}
          >
            <Typography variant="caption" color="text.secondary">
              {metric.label}
            </Typography>
            <Typography variant="body1">{metric.value}</Typography>
          </Box>
        ))}
      </Box>
    );
  };

  const loadMetrics = [
    {
      label: "Box quantity (Sasia - Pako)",
      value: formatQuantity(req.BoxCount),
    },
    {
      label: "Calculated pallets",
      value: formatQuantity(req.PalletCount),
    },
    {
      label: "Full pallets",
      value: formatQuantity(req.FullPallets, 2),
    },
    {
      label: "Remaining boxes",
      value: formatQuantity(req.RemainingBoxes),
    },
    {
      label: "Boxes per pallet",
      value: formatQuantity(req.BoxesPerPallet, 2),
    },
    {
      label: "Boxes per layer",
      value: formatQuantity(req.BoxesPerLayer, 2),
    },
    {
      label: "Layers per pallet",
      value: formatQuantity(req.LayersPerPallet, 2),
    },
  ];

  const weightVolumeMetrics = [
    {
      label: "Pallet weight (kg)",
      value: formatQuantity(req.PalletWeightKg, 2),
    },
    {
      label: "Pallet volume (m³)",
      value: formatQuantity(req.PalletVolumeM3, 3),
    },
    {
      label: "Box weight (kg)",
      value: formatQuantity(req.BoxWeightKg, 2),
    },
    {
      label: "Box volume (m³)",
      value: formatQuantity(req.BoxVolumeM3, 3),
    },
    {
      label: "Pallet utilization",
      value: formatPercent(req.PalletVolumeUtilization),
    },
    {
      label: "Weight · full pallets (kg)",
      value: formatQuantity(req.WeightFullPalletsKg, 2),
    },
    {
      label: "Volume · full pallets (m³)",
      value: formatQuantity(req.VolumeFullPalletsM3, 3),
    },
    {
      label: "Weight · remaining (kg)",
      value: formatQuantity(req.WeightRemainingKg, 2),
    },
    {
      label: "Volume · remaining (m³)",
      value: formatQuantity(req.VolumeRemainingM3, 3),
    },
    {
      label: "Total shipment weight (kg)",
      value: formatQuantity(req.TotalShipmentWeightKg, 2),
    },
    {
      label: "Total shipment volume (m³)",
      value: formatQuantity(req.TotalShipmentVolumeM3, 3),
    },
  ];

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
            {req.Comment && (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Requester note
                </Typography>
                <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>
                  {req.Comment}
                </Typography>
              </Stack>
            )}
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
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Load details
              </Typography>
              {renderMetricGrid(loadMetrics)}
            </Stack>
            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Weight &amp; volume metrics
              </Typography>
              {renderMetricGrid(weightVolumeMetrics)}
            </Stack>
            <Stack spacing={0.5} direction={{ xs: "column", sm: "row" }} gap={{ sm: 6 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Requested by
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {req.Requester}
                </Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Confirmed by
                </Typography>
                <Typography variant="body1" fontWeight={600}>
                  {req.ConfirmedBy ?? "—"}
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
