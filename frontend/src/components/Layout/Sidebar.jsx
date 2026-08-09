import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography } from '@mui/material';
import { NavLink } from 'react-router-dom';
import { logout } from '../../api';

const drawerWidth = 240;

const menuItems = [
  { text: 'Аналитика', icon: 'analytics', path: '/', managerOnly: true },
  { text: 'Заказы', icon: 'shopping_bag', path: '/orders' },
  { text: 'Клиенты', icon: 'person', path: '/clients' },
  { text: 'Склад', icon: 'inventory_2', path: '/warehouse' },
  { text: 'Каталог', icon: 'menu_book', path: '/catalog' },
  { text: 'Пользователи', icon: 'group', path: '/users', managerOnly: true },
  { text: 'Журнал', icon: 'history', path: '/audit', managerOnly: true },
];

const Sidebar = () => {
  const userRole = localStorage.getItem('user_role');
  const visibleMenuItems = menuItems.filter(item => !item.managerOnly || userRole === 'manager');
  return (
    <Drawer
      variant="permanent"
      sx={{
        width: drawerWidth,
        flexShrink: 0,
        '& .MuiDrawer-paper': {
          width: drawerWidth,
          boxSizing: 'border-box',
          backgroundColor: '#F5F7FA', // Matches the very light background
          borderRight: 'none',
        },
      }}
    >
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
                  <span className="material-icons" style={{ fontSize: 20 }}>{item.icon}</span>
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 500 }}
                />
                <span className="material-icons" style={{ fontSize: 16 }}>chevron_right</span>
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Box sx={{ px: 2, pb: 2 }}>
          <ListItemButton
            onClick={logout}
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
              <span className="material-icons" style={{ fontSize: 20 }}>logout</span>
            </ListItemIcon>
            <ListItemText
              primary="Выйти"
              primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: 500 }}
            />
          </ListItemButton>
        </Box>
      </Box>
    </Drawer>
  );
};

export default Sidebar;
