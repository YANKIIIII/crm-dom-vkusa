import { createTheme } from '@mui/material/styles';
import { ruRU } from '@mui/material/locale';

const theme = createTheme({
  palette: {
    mode: 'light',
    background: {
      default: '#F5F7FA', // Very light blue-grey background
      paper: '#FFFFFF',
    },
    primary: {
      main: '#CC5E33', // The specific orange from the screenshot
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#2F80ED', // Blue for "Добавить товар" buttons
    },
    text: {
      primary: '#1A202C',
      secondary: '#718096',
    },
    divider: '#EDF2F7',
  },
  typography: {
    fontFamily: "'Inter', 'Roboto', sans-serif",
    button: {
      textTransform: 'uppercase', // Buttons like "СОХРАНИТЬ ЗАКАЗ" are uppercase
      fontWeight: 600,
    },
    h4: {
      fontWeight: 500,
      fontSize: '1.75rem',
      color: '#1A202C',
    },
    h5: {
      fontWeight: 500,
      fontSize: '1.5rem',
      color: '#1A202C',
    }
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          boxShadow: '0px 2px 10px rgba(0, 0, 0, 0.03)',
          borderRadius: 16,
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          padding: '8px 16px',
          boxShadow: 'none',
          '&:hover': {
            boxShadow: 'none',
          }
        },
        containedPrimary: {
          backgroundColor: '#CC5E33',
          '&:hover': {
            backgroundColor: '#B3532C',
          },
        },
        outlinedSecondary: {
          borderColor: '#E2E8F0', // Often blue or grey depending on use case
          color: '#2F80ED',
        }
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 4,
          '& .MuiOutlinedInput-notchedOutline': {
            borderColor: '#E2E8F0',
          },
          '& input[type="date"]': {
            color: '#1A202C',
            colorScheme: 'light',
          },
          '& input[type="date"]::-webkit-datetime-edit': {
            minWidth: '8rem',
            padding: 0,
          },
          '& input[type="date"]::-webkit-datetime-edit-fields-wrapper': {
            padding: 0,
          },
          '& input[type="date"]::-webkit-calendar-picker-indicator': {
            cursor: 'pointer',
            opacity: 1,
          },
        },
      },
    },
    MuiTableContainer: {
      styleOverrides: {
        root: {
          overflowX: 'auto',
        },
      },
    },
    MuiTablePagination: {
      defaultProps: {
        rowsPerPageOptions: [25, 50, 100],
      },
    },
    MuiTableCell: {
      styleOverrides: {
        root: {
          borderBottom: '1px solid #EDF2F7',
          padding: '12px 16px',
        },
        head: {
          fontWeight: 600,
          color: '#4A5568',
        }
      }
    }
  },
}, ruRU);

export default theme;
