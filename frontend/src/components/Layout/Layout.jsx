import { useState } from 'react';
import { Box, IconButton, useMediaQuery, useTheme } from '@mui/material';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

const drawerWidth = 240;

const Layout = () => {
  const theme = useTheme();
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);

  const handleDrawerToggle = () => {
    setMobileOpen((prev) => !prev);
  };

  const handleDrawerClose = () => {
    setMobileOpen(false);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Box
        component="a"
        href="#main-content"
        sx={{
          position: 'absolute',
          left: -9999,
          '&:focus': {
            left: 16,
            top: 16,
            zIndex: 2000,
            px: 2,
            py: 1,
            bgcolor: 'background.paper',
            color: 'text.primary',
          },
        }}
      >
        К содержимому
      </Box>
      <Sidebar
        mobile={mobile}
        mobileOpen={mobileOpen}
        onClose={handleDrawerClose}
      />
      <Box
        component="main"
        id="main-content"
        sx={{
          flexGrow: 1,
          p: 4,
          width: mobile ? '100%' : `calc(100% - ${drawerWidth}px)`,
        }}
      >
        {mobile && (
          <Box sx={{ mb: 2, ml: -1 }}>
            <IconButton
              color="inherit"
              aria-label="Открыть меню"
              edge="start"
              onClick={handleDrawerToggle}
            >
              <span className="material-icons" aria-hidden="true">menu</span>
            </IconButton>
          </Box>
        )}
        <Outlet />
      </Box>
    </Box>
  );
};

export default Layout;
