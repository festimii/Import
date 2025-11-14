import { alpha, useTheme } from "@mui/material/styles";
import { Box, Container, Divider, Stack, Typography } from "@mui/material";

const PageHero = ({
  title,
  subtitle,
  actions,
  children,
  maxWidth = "lg",
  sx,
}) => {
  const theme = useTheme();
  const actionElements = Array.isArray(actions)
    ? actions.filter(Boolean)
    : actions
    ? [actions]
    : [];

  return (
    <Box
      sx={{
        background: (theme) =>
          `linear-gradient(120deg, ${alpha(theme.palette.primary.main, 0.08)} 0%, ${
            theme.palette.background.default
          } 100%)`,
        borderBottom: (theme) => `1px solid ${alpha(theme.palette.divider, 0.3)}`,
        backdropFilter: "blur(12px)",
        ...sx,
      }}
    >
      <Container maxWidth={maxWidth} sx={{ py: { xs: 2.5, md: 3 } }}>
        <Box
          sx={{
            borderRadius: { xs: 3, md: 4 },
            px: { xs: 2.5, md: 3.5 },
            py: { xs: 2, md: 3 },
            background: (theme) =>
              `linear-gradient(135deg, ${alpha(theme.palette.background.paper, 0.95)} 0%, ${alpha(
                theme.palette.background.default,
                0.92
              )} 100%)`,
            border: (theme) => `1px solid ${alpha(theme.palette.common.white, 0.2)}`,
            boxShadow: (theme) => `0 20px 45px ${alpha(theme.palette.common.black, 0.12)}`,
          }}
        >
          <Stack spacing={2.5}>
            <Stack
              direction={{ xs: "column", md: "row" }}
              spacing={3}
              alignItems={{ xs: "flex-start", md: "center" }}
              justifyContent="space-between"
            >
              <Stack spacing={0.75} sx={{ flex: 1, minWidth: 0 }}>
                <Typography
                  variant="overline"
                  sx={{ letterSpacing: 2, color: alpha(theme.palette.text.primary, 0.6) }}
                >
                  Import Operations
                </Typography>
                <Typography
                  variant="h4"
                  component="h1"
                  sx={{ fontWeight: 600, color: theme.palette.text.primary }}
                >
                  {title}
                </Typography>
                {subtitle && (
                  <Typography variant="body1" color="text.secondary">
                    {subtitle}
                  </Typography>
                )}
              </Stack>

              {actionElements.length > 0 && (
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="flex-end"
                  spacing={1}
                  flexWrap="wrap"
                  useFlexGap
                >
                  {actionElements.map((action, index) => (
                    <Box key={action?.key ?? index}>{action}</Box>
                  ))}
                </Stack>
              )}
            </Stack>

            {children && (
              <>
                <Divider sx={{ borderStyle: "dashed", borderColor: alpha(theme.palette.text.primary, 0.12) }} />
                <Box>{children}</Box>
              </>
            )}
          </Stack>
        </Box>
      </Container>
    </Box>
  );
};

export default PageHero;

