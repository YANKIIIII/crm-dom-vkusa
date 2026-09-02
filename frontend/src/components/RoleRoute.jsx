import { Box, Typography, Button, Alert } from '@mui/material';
import { Link as RouterLink, Navigate } from 'react-router-dom';
import { hasModule, homePath } from '../utils';

const RoleRoute = ({ roles, module, children, redirectTo }) => {
  const role = localStorage.getItem('user_role');
  const allowed = module
    ? hasModule(module)
    : Boolean(role && roles?.includes(role));
  if (!allowed) {
    const target = redirectTo === 'home' ? homePath() : redirectTo;
    if (target) {
      return <Navigate to={target} replace />;
    }
    return (
      <Box sx={{ p: 4, maxWidth: 480 }}>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Недостаточно прав
        </Alert>
        <Typography
          variant="body1"
          sx={{
            color: "text.secondary",
            mb: 2
          }}>
          Этот раздел недоступен с вашими правами.
        </Typography>
        <Button component={RouterLink} to={homePath()} variant="contained">
          На главную
        </Button>
      </Box>
    );
  }
  return children;
};

export default RoleRoute;
