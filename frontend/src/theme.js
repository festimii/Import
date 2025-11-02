import { createTheme } from "@mui/material/styles";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#1b4b91",
      light: "#5f89d5",
      dark: "#0f2e5e",
    },
    secondary: {
      main: "#2eb88a",
      light: "#5ed4a9",
      dark: "#1a7f5f",
    },
    background: {
      default: "#f2f5fb",
      paper: "#ffffff",
    },
  },
  typography: {
    fontFamily: "'Inter', 'Roboto', 'Helvetica', 'Arial', sans-serif",
    h1: {
      fontWeight: 600,
    },
    h2: {
      fontWeight: 600,
    },
    h4: {
      fontWeight: 600,
      letterSpacing: "-0.01em",
    },
    h5: {
      fontWeight: 600,
      letterSpacing: "-0.005em",
    },
    button: {
      fontWeight: 600,
    },
    body1: {
      lineHeight: 1.6,
    },
    body2: {
      lineHeight: 1.6,
    },
  },
  shape: {
    borderRadius: 16,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 999,
          textTransform: "none",
          paddingLeft: 28,
          paddingRight: 28,
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 20,
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 20,
          border: "1px solid rgba(27, 75, 145, 0.08)",
          boxShadow:
            "0px 20px 45px -25px rgba(27, 75, 145, 0.45), 0px 12px 20px -15px rgba(46, 184, 138, 0.3)",
        },
      },
    },
    MuiAlert: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiTextField: {
      defaultProps: {
        variant: "outlined",
      },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": {
            borderRadius: 14,
          },
        },
      },
    },
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          minHeight: "100vh",
          margin: 0,
          background:
            "radial-gradient(circle at 10% 20%, rgba(27,75,145,0.08) 0%, rgba(255,255,255,0.7) 45%, rgba(46,184,138,0.08) 100%)",
        },
        "#root": {
          minHeight: "100vh",
        },
      },
    },
  },
});

export default theme;
