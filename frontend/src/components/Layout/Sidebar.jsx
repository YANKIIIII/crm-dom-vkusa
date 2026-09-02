import { Box, Drawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, Alert, CircularProgress } from '@mui/material';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import api, { logout } from '../../api';
import { useFeedback } from '../../hooks/useFeedback';
import { extractApiError, hasModule } from '../../utils';
import BrandMark from '../BrandMark';

const drawerWidth = 240;

const menuItems = [
  { text: 'Аналитика', icon: 'analytics', path: '/', module: 'analytics' },
  { text: 'Заказы', icon: 'shopping_bag', path: '/orders', module: 'orders' },
  { text: 'Клиенты', icon: 'person', path: '/clients', module: 'clients' },
  { text: 'Задачи', icon: 'view_kanban', path: '/tasks', module: 'tasks' },
  { text: 'Склад', icon: 'inventory_2', path: '/warehouse', module: 'warehouse' },
  { text: 'Справочники', icon: 'menu_book', path: '/references', module: 'references' },
  { text: 'Персонал', icon: 'badge', path: '/personnel', module: 'personnel' },
  { text: 'Пользователи', icon: 'group', path: '/users', module: 'users' },
  { text: 'Журнал', icon: 'history', path: '/audit', module: 'audit' },
];

const drawerPaperSx = {
  width: drawerWidth,
  boxSizing: 'border-box',
  backgroundColor: '#F5F7FA',
  borderRight: 'none',
};

const Sidebar = ({ mobile = false, mobileOpen = false, onClose }) => {
  const { notify, confirm } = useFeedback();
  const userRole = localStorage.getItem('user_role');
  const userName = localStorage.getItem('user_name') || '';
  const jobTitle = localStorage.getItem('user_job_title') || '';
  const visibleMenuItems = menuItems.filter((item) => hasModule(item.module));
  const roleLabel = jobTitle || (userRole === 'manager' ? 'Руководитель' : 'Сотрудник');
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pwdCurrent, setPwdCurrent] = useState('');
  const [pwd1, setPwd1] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [pwdError, setPwdError] = useState(null);
  const [pwdSaving, setPwdSaving] = useState(false);

  const handleLogout = async () => {
    if (!(await confirm('Выйти из системы?'))) return;
    await logout();
  };

  const openPasswordDialog = () => {
    setPwdCurrent('');
    setPwd1('');
    setPwd2('');
    setPwdError(null);
    setPwdOpen(true);
  };

  const handleChangePassword = async () => {
    if (!pwdCurrent) {
      setPwdError('Укажите текущий пароль');
      return;
    }
    if (!pwd1) {
      setPwdError('Укажите новый пароль');
      return;
    }
    if (pwd1 !== pwd2) {
      setPwdError('Пароли не совпадают');
      return;
    }
    setPwdSaving(true);
    setPwdError(null);
    try {
      await api.patch('/users/users/me/', {
        current_password: pwdCurrent,
        password: pwd1,
      });
      setPwdOpen(false);
      notify('Пароль изменён. Войдите снова.', 'success');
      await logout();
    } catch (err) {
      setPwdError(extractApiError(err));
    } finally {
      setPwdSaving(false);
    }
  };

  const drawerContent = (
    <Box sx={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <Box sx={{ p: 3, display: 'flex', alignItems: 'center', gap: 1.25, mb: 2 }}>
        <BrandMark height={48} />
        <Typography variant="h6" sx={{ fontWeight: 'bold', color: '#1A202C', lineHeight: 1.2 }}>
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
          <Button
            size="small"
            onClick={openPasswordDialog}
            sx={{ mt: 0.5, px: 0, minWidth: 0, textTransform: 'none' }}
          >
            Сменить пароль
          </Button>
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

  const passwordDialog = (
    <Dialog open={pwdOpen} onClose={() => setPwdOpen(false)} maxWidth="xs" fullWidth>
      <DialogTitle>Смена пароля</DialogTitle>
      <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
        {pwdError && (
          <Alert severity="error" role="alert" aria-live="assertive">
            {pwdError}
          </Alert>
        )}
        <TextField
          autoFocus
          fullWidth
          label="Текущий пароль"
          type="password"
          value={pwdCurrent}
          onChange={(e) => setPwdCurrent(e.target.value)}
          autoComplete="current-password"
        />
        <TextField
          fullWidth
          label="Новый пароль"
          type="password"
          value={pwd1}
          onChange={(e) => setPwd1(e.target.value)}
          autoComplete="new-password"
        />
        <TextField
          fullWidth
          label="Повторите пароль"
          type="password"
          value={pwd2}
          onChange={(e) => setPwd2(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleChangePassword()}
          autoComplete="new-password"
        />
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => setPwdOpen(false)} color="inherit">Отмена</Button>
        <Button onClick={handleChangePassword} variant="contained" disabled={pwdSaving}>
          {pwdSaving ? <CircularProgress size={22} /> : 'Сохранить'}
        </Button>
      </DialogActions>
    </Dialog>
  );

  if (mobile) {
    return (
      <>
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
        {passwordDialog}
      </>
    );
  }

  return (
    <>
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
      {passwordDialog}
    </>
  );
};

export default Sidebar;
