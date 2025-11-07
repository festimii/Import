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

            <Stack spacing={0.5} direction={{ xs: "column", sm: "row" }} gap={{ sm: 6 }}>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Total boxes
                </Typography>
                <Typography variant="body1">{formatQuantity(group.totalBoxes)}</Typography>
              </Box>
              <Box>
                <Typography variant="subtitle2" color="text.secondary">
                  Calculated pallets
                </Typography>
                <Typography variant="body1">{formatQuantity(group.totalPallets)}</Typography>
              </Box>
            </Stack>

            <Stack spacing={0.5}>
              <Typography variant="subtitle2" color="text.secondary">
                Articles in this bill
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Article</TableCell>
                    <TableCell align="right">Boxes</TableCell>
                    <TableCell align="right">Pallets</TableCell>
                    <TableCell align="right">Requester</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {group.items.map((item) => (
                    <TableRow key={item.ID} hover>
                      <TableCell>{formatArticleCode(item.Article)}</TableCell>
                      <TableCell align="right">
                        {formatQuantity(item.BoxCount)}
                      </TableCell>
                      <TableCell align="right">
                        {formatQuantity(item.PalletCount)}
                      </TableCell>
                      <TableCell align="right">{item.Requester ?? "—"}</TableCell>
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
