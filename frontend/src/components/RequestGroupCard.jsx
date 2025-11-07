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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import CheckRoundedIcon from "@mui/icons-material/CheckRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import EventRepeatRoundedIcon from "@mui/icons-material/EventRepeatRounded";
import LocalShippingRoundedIcon from "@mui/icons-material/LocalShippingRounded";
import formatArticleCode from "../utils/formatArticle";

const formatDate = (value) => {
  if (!value) return "—";
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString();
  }
  if (typeof value === "string" && value.length > 0) {
    return value;
  }
  return "—";
};

const formatQuantity = (value, fractionDigits = 0) => {
  if (value === null || value === undefined) return "—";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";
  return numericValue.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
};

const formatPercent = (value, fractionDigits = 1) => {
  if (value === null || value === undefined) return "—";
  const numericValue = Number(value);
  if (!Number.isFinite(numericValue)) return "—";
  return `${numericValue.toLocaleString(undefined, {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}%`;
};

const renderMetricList = (metrics) => {
  const filtered = metrics.filter((metric) => metric.value !== "—");
  if (filtered.length === 0) {
    return (
      <Typography variant="body2" color="text.secondary">
        —
      </Typography>
    );
  }

  return (
    <Stack spacing={0.75}>
      {filtered.map((metric) => (
        <Stack key={metric.label} spacing={0.25}>
          <Typography variant="caption" color="text.secondary">
            {metric.label}
          </Typography>
          <Typography variant="body2">{metric.value}</Typography>
        </Stack>
      ))}
    </Stack>
  );
};

export default function RequestGroupCard({
  group,
  onApprove,
  onReject,
  onProposeDate,
}) {
  const theme = useTheme();

  const sharedArrivalDate = group.sharedArrivalDate
    ? formatDate(group.sharedArrivalDate)
    : group.arrivalDateConflict
    ? "Multiple dates"
    : "—";

  return (
    <Card
      elevation={12}
      sx={{
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderRadius: 4,
        background: `linear-gradient(150deg, ${alpha(
          theme.palette.background.paper,
          0.9
        )} 0%, ${alpha(theme.palette.primary.main, 0.05)} 100%)`,
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
                Request bill #{group.reference}
              </Typography>
              <Typography variant="h6">{group.importer}</Typography>
            </Stack>
            <Chip
              label={`${group.items.length} article${group.items.length === 1 ? "" : "s"}`}
              size="small"
              sx={{
                marginLeft: "auto",
                backgroundColor: alpha(theme.palette.primary.main, 0.08),
              }}
            />
          </Stack>

          <Divider sx={{ my: 1 }} />

          <Stack spacing={1.5}>
            <Stack spacing={0.5} direction={{ xs: "column", sm: "row" }} gap={{ sm: 6 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Request date
                </Typography>
                <Typography variant="body1">{formatDate(group.requestDate)}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Arrival date (Data Arritjes)
                </Typography>
                <Typography variant="body1">{sharedArrivalDate}</Typography>
              </Box>
            </Stack>

            {(() => {
              const metrics = [
                {
                  label: "Total boxes",
                  value: formatQuantity(group.totalBoxes),
                },
                {
                  label: "Calculated pallets",
                  value: formatQuantity(group.totalPallets),
                },
                {
                  label: "Full pallets",
                  value: formatQuantity(group.totalFullPallets, 2),
                },
                {
                  label: "Remaining boxes",
                  value: formatQuantity(group.totalRemainingBoxes),
                },
                {
                  label: "Total shipment weight (kg)",
                  value: formatQuantity(group.totalShipmentWeightKg, 2),
                },
                {
                  label: "Total shipment volume (m³)",
                  value: formatQuantity(group.totalShipmentVolumeM3, 3),
                },
                {
                  label: "Weight · full pallets (kg)",
                  value: formatQuantity(group.totalWeightFullPalletsKg, 2),
                },
                {
                  label: "Volume · full pallets (m³)",
                  value: formatQuantity(group.totalVolumeFullPalletsM3, 3),
                },
                {
                  label: "Weight · remaining (kg)",
                  value: formatQuantity(group.totalWeightRemainingKg, 2),
                },
                {
                  label: "Volume · remaining (m³)",
                  value: formatQuantity(group.totalVolumeRemainingM3, 3),
                },
              ].filter((metric) => metric.value !== "—");

              if (metrics.length === 0) {
                return null;
              }

              return (
                <Stack spacing={0.75}>
                  <Typography variant="subtitle2" color="text.secondary">
                    Load summary
                  </Typography>
                  <Box
                    sx={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 2,
                    }}
                  >
                    {metrics.map((metric) => (
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
                </Stack>
              );
            })()}

            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Articles in this bill
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Article</TableCell>
                    <TableCell>Load details</TableCell>
                    <TableCell>Weight &amp; volume</TableCell>
                    <TableCell align="right">Requester</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.items.map((item) => (
                    <TableRow key={item.ID} hover>
                      <TableCell sx={{ minWidth: 160 }}>
                        <Typography variant="body2" fontWeight={600} gutterBottom>
                          {formatArticleCode(item.Article)}
                        </Typography>
                        {item.Comment && (
                          <Typography
                            variant="caption"
                            color="text.secondary"
                            sx={{ whiteSpace: "pre-wrap" }}
                          >
                            {item.Comment}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell sx={{ minWidth: 200 }}>
                        {renderMetricList([
                          {
                            label: "Boxes",
                            value: formatQuantity(item.BoxCount),
                          },
                          {
                            label: "Pallets",
                            value: formatQuantity(item.PalletCount),
                          },
                          {
                            label: "Full pallets",
                            value: formatQuantity(item.FullPallets, 2),
                          },
                          {
                            label: "Remaining boxes",
                            value: formatQuantity(item.RemainingBoxes),
                          },
                          {
                            label: "Boxes per pallet",
                            value: formatQuantity(item.BoxesPerPallet, 2),
                          },
                          {
                            label: "Boxes per layer",
                            value: formatQuantity(item.BoxesPerLayer, 2),
                          },
                          {
                            label: "Layers per pallet",
                            value: formatQuantity(item.LayersPerPallet, 2),
                          },
                        ])}
                      </TableCell>
                      <TableCell sx={{ minWidth: 220 }}>
                        {renderMetricList([
                          {
                            label: "Pallet weight (kg)",
                            value: formatQuantity(item.PalletWeightKg, 2),
                          },
                          {
                            label: "Pallet volume (m³)",
                            value: formatQuantity(item.PalletVolumeM3, 3),
                          },
                          {
                            label: "Box weight (kg)",
                            value: formatQuantity(item.BoxWeightKg, 2),
                          },
                          {
                            label: "Box volume (m³)",
                            value: formatQuantity(item.BoxVolumeM3, 3),
                          },
                          {
                            label: "Pallet utilization",
                            value: formatPercent(item.PalletVolumeUtilization),
                          },
                          {
                            label: "Weight · full pallets (kg)",
                            value: formatQuantity(item.WeightFullPalletsKg, 2),
                          },
                          {
                            label: "Volume · full pallets (m³)",
                            value: formatQuantity(item.VolumeFullPalletsM3, 3),
                          },
                          {
                            label: "Weight · remaining (kg)",
                            value: formatQuantity(item.WeightRemainingKg, 2),
                          },
                          {
                            label: "Volume · remaining (m³)",
                            value: formatQuantity(item.VolumeRemainingM3, 3),
                          },
                          {
                            label: "Total shipment weight (kg)",
                            value: formatQuantity(item.TotalShipmentWeightKg, 2),
                          },
                          {
                            label: "Total shipment volume (m³)",
                            value: formatQuantity(item.TotalShipmentVolumeM3, 3),
                          },
                        ])}
                      </TableCell>
                      <TableCell align="right" sx={{ minWidth: 120 }}>
                        {item.Requester ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Stack>

            {group.comments.length > 0 && (
              <Stack spacing={0.5}>
                <Typography variant="subtitle2" color="text.secondary">
                  Requester notes
                </Typography>
                {group.comments.map((comment, index) => (
                  <Typography
                    key={`${comment}-${index}`}
                    variant="body2"
                    sx={{ whiteSpace: "pre-wrap" }}
                  >
                    {comment}
                  </Typography>
                ))}
              </Stack>
            )}
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
            onClick={() => onProposeDate(group)}
          >
            Propose new date
          </Button>
        )}
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button
            variant="outlined"
            color="error"
            startIcon={<CloseRoundedIcon />}
            onClick={() => onReject(group)}
          >
            Reject all
          </Button>
          <Button
            variant="contained"
            color="secondary"
            startIcon={<CheckRoundedIcon />}
            onClick={() => onApprove(group)}
          >
            Approve all
          </Button>
        </Box>
      </CardActions>
    </Card>
  );
}
