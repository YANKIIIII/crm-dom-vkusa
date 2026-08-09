import { Box, Typography, Button, Alert } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';

const RoleRoute = ({ roles, children }) => {
  const role = localStorage.getItem('user_role');
  if (!role || !roles.includes(role)) {
    return (
      <Box sx={{ p: 4, maxWidth: 480 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Недостаточно прав
        </Alert>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 2 }}>
          Эта страница доступна только менеджерам.
        </Typography>
        <Button component={RouterLink} to="/orders" variant="contained">
          К заказам
        </Button>
      </Box>
    );
  }
  return children;
};

export default RoleRoute;
