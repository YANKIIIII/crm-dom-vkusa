import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { NavLink } from 'react-router-dom';
import { logout } from '../../api';
import { useFeedback } from '../../hooks/useFeedback';

const drawerWidth = 240;

const menuItems = [
  { text: 'Аналитика', icon: 'analytics', path: '/', managerOnly: true },
  { text: 'Заказы', icon: 'shopping_bag', path: '/orders' },
  { text: 'Клиенты', icon: 'person', path: '/clients' },
  { text: 'Склад', icon: 'inventory_2', path: '/warehouse' },
  { text: 'Пользователи', icon: 'group', path: '/users', managerOnly: true },
  { text: 'Журнал', icon: 'history', path: '/audit', managerOnly: true },
];

const drawerPaperSx = {
  width: drawerWidth,
  boxSizing: 'border-box',
  backgroundColor: '#F5F7FA',
  borderRight: 'none',
};

const Sidebar = ({ mobile = false, mobileOpen = false, onClose }) => {
  const { confirm } = useFeedback();
  const userRole = localStorage.getItem('user_role');
  const userName = localStorage.getItem('user_name') || '';
  const visibleMenuItems = menuItems.filter(item => !item.managerOnly || userRole === 'manager');
  const roleLabel = userRole === 'manager' ? 'Руководитель' : 'Продавец';

  const handleLogout = async () => {
    if (!(await confirm('Выйти из системы?'))) return;
    await logout();
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.5, mb: 2 }}>
        <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1A202C' }}>
          Дом Вкуса
        </Typography>
      </Box>
      <List sx={{ px: 2, flex: 1 }}>
        {visibleMenuItems.map((item) => (
          <ListItem key={item.text} disablePadding sx={{ mb: 1 }}>
            <ListItemButton
              component={NavLink}
              to={item.path}
              onClick={mobile ? onClose : undefined}
              sx={{
                borderRadius: '8px',
                color: '#718096',
                '&.active': {
                  backgroundColor: '#CC5E33',
                  color: '#FFFFFF',
                  '& .MuiListItemIcon-root': { color: '#FFFFFF' },
                  '& .MuiListItemText-primary': { color: '#FFFFFF', fontWeight: 500 }
                },
                '&:hover:not(.active)': {
                  backgroundColor: 'rgba(204, 94, 51, 0.1)',
                  color: '#CC5E33',
                  '& .MuiListItemIcon-root': { color: '#CC5E33' }
                }
              }}
            >
              <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
                <span className="material-icons" style={{ fontSize: 20 }} aria-hidden="true">{item.icon}</span>
              </ListItemIcon>
              <ListItemText
                primary={item.text}
                slotProps={{ primary: { sx: { fontSize: '0.9rem', fontWeight: 500 } } }}
              />
              <span className="material-icons" style={{ fontSize: 16 }} aria-hidden="true">chevron_right</span>
            </ListItemButton>
          </ListItem>
        ))}
      </List>
      <Box sx={{ px: 2, pb: 2 }}>
        <Box sx={{ px: 1.5, pb: 1.5 }}>
          <Typography variant="body2" sx={{ fontWeight: 600, color: '#1A202C' }}>
            {userName || 'Пользователь'}
          </Typography>
          <Typography variant="caption" sx={{ color: '#718096' }}>
            {roleLabel}
          </Typography>
        </Box>
        <ListItemButton
          onClick={handleLogout}
          aria-label="Выйти"
          sx={{
            borderRadius: '8px',
            color: '#718096',
            '&:hover': {
              backgroundColor: 'rgba(204, 94, 51, 0.1)',
              color: '#CC5E33',
              '& .MuiListItemIcon-root': { color: '#CC5E33' }
            }
          }}
        >
          <ListItemIcon sx={{ color: 'inherit', minWidth: 40 }}>
            <span className="material-icons" style={{ fontSize: 20 }} aria-hidden="true">logout</span>
          </ListItemIcon>
          <ListItemText
            primary="Выйти"
            slotProps={{ primary: { sx: { fontSize: '0.9rem', fontWeight: 500 } } }}
          />
        </ListItemButton>
      </Box>
    </Box>
  );

  if (mobile) {
    return (
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={onClose}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': drawerPaperSx,
        }}
      >
        {drawerContent}
      </Drawer>
    );
  }

  return (
    <Drawer
      variant="permanent"
      sx={{
        display: { xs: 'none', md: 'block' },
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': drawerPaperSx,
      }}
    >
      {drawerContent}
    </Drawer>
  );
};

export default Sidebar;
