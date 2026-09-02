import { Box, Typography, Paper, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TablePagination, Dialog, DialogTitle, DialogContent, DialogActions, TextField, CircularProgress, Alert, IconButton, Tooltip, Switch, FormControlLabel, Checkbox, FormGroup, FormLabel } from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../api';
import { useFeedback } from '../hooks/useFeedback';
import { extractApiError, PAGE_SIZE, PAGE_SIZE_OPTIONS, toggleOrdering, buildListQuery, GRANTABLE_MODULES, SELLER_DEFAULT_MODULES } from '../utils';
import SortableHeader from '../components/SortableHeader';
import SearchableSelect from '../components/SearchableSelect';
import TruncatedText from '../components/TruncatedText';

const ROLE_LABELS = {
  seller: 'Сотрудник',
  manager: 'Руководитель',
};

const EMPTY_FORM = {
  first_name: '',
  last_name: '',
  email: '',
  username: '',
  password: '',
  role: 'seller',
  job_title: '',
  modules: [...SELLER_DEFAULT_MODULES],
  is_active: true,
};

const formatDateTime = (value) => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('ru-RU');
};

const fullName = (row) => (
  `${row.last_name || ''} ${row.first_name || ''}`.trim() || row.username || '—'
);

const Users = () => {
  const { notify, confirm } = useFeedback();
  const currentUsername = localStorage.getItem('user_username');
  const [users, setUsers] = useState([]);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const [ordering, setOrdering] = useState('id');
  const [loading, setLoading] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [openModal, setOpenModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formError, setFormError] = useState(null);
  const [formData, setFormData] = useState(EMPTY_FORM);
  const [listVersion, setListVersion] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setListLoading(true);
    api.get(`/users/users/?${buildListQuery({
      page: page + 1,
      pageSize,
      ordering,
    })}`)
      .then((response) => {
        if (!cancelled) {
          setUsers(response.data.results || response.data);
          setTotalCount(response.data.count || 0);
          setListError(null);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setListError(extractApiError(error));
          notify(`Не удалось загрузить пользователей:\n${extractApiError(error)}`, 'error');
        }
      })
      .finally(() => {
        if (!cancelled) setListLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [notify, page, pageSize, ordering, listVersion]);

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const openCreate = () => {
    setEditingId(null);
    setFormData(EMPTY_FORM);
    setFormError(null);
    setOpenModal(true);
  };

  const openEdit = (row) => {
    setEditingId(row.id);
    setFormData({
      first_name: row.first_name || '',
      last_name: row.last_name || '',
      email: row.email || '',
      username: row.username || '',
      password: '',
      role: row.role || 'seller',
      job_title: row.job_title || '',
      modules: row.role === 'manager'
        ? [...SELLER_DEFAULT_MODULES]
        : (row.modules?.length ? row.modules : [...SELLER_DEFAULT_MODULES]),
      is_active: row.is_active !== false,
    });
    setFormError(null);
    setOpenModal(true);
  };

  const handleSaveUser = async () => {
    setLoading(true);
    setFormError(null);
    const payload = {
      first_name: formData.first_name,
      last_name: formData.last_name,
      email: formData.email,
      username: formData.username,
      role: formData.role,
      job_title: formData.job_title,
      is_active: (editingId && formData.username === currentUsername) ? true : formData.is_active,
    };
    if (formData.role === 'seller') {
      if (!formData.modules.length) {
        setFormError('Выберите хотя бы один раздел');
        setLoading(false);
        return;
      }
      payload.modules = formData.modules;
    }
    if (formData.password) payload.password = formData.password;
    try {
      if (editingId) {
        await api.patch(`/users/users/${editingId}/`, payload);
      } else {
        if (!formData.password) {
          setFormError('Укажите пароль');
          setLoading(false);
          return;
        }
        await api.post('/users/users/', payload);
      }
      setOpenModal(false);
      setListVersion((v) => v + 1);
    } catch (error) {
      setFormError(`Не удалось сохранить пользователя: ${extractApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (row) => {
    if (!(await confirm(`Удалить пользователя ${row.username}?`))) return;
    setDeletingId(row.id);
    try {
      await api.delete(`/users/users/${row.id}/`);
      setListVersion((v) => v + 1);
    } catch (error) {
      notify(`Не удалось удалить пользователя:\n${extractApiError(error)}`, 'error');
    } finally {
      setDeletingId(null);
    }
  };

  const handleToggleActive = async (row) => {
    if (row.username === currentUsername) {
      notify('Нельзя отключить собственную учётную запись.', 'warning');
      return;
    }
    try {
      await api.patch(`/users/users/${row.id}/`, { is_active: !row.is_active });
      setListVersion((v) => v + 1);
    } catch (error) {
      notify(`Не удалось изменить статус:\n${extractApiError(error)}`, 'error');
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 4 }}>
        <Typography variant="h4">Пользователи</Typography>
        <Button variant="contained" color="primary" onClick={openCreate}>
          НОВЫЙ ПОЛЬЗОВАТЕЛЬ +
        </Button>
      </Box>

      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <SortableHeader field="id" label="ID" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <SortableHeader field="last_name" label="ФИО" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <SortableHeader field="username" label="Логин" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <SortableHeader field="role" label="Роль" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <TableCell>Должность</TableCell>
                <SortableHeader field="is_active" label="Активен" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} />
                <SortableHeader field="last_login" label="Последний вход" ordering={ordering} onSort={(field, desc) => { setOrdering(toggleOrdering(ordering, field, desc)); setPage(0); }} defaultDesc />
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {listLoading ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: '#718096' }}>Загрузка…</TableCell>
                </TableRow>
              ) : listError ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: '#E53E3E' }}>
                    Не удалось загрузить пользователей
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4, color: '#718096' }}>Нет пользователей</TableCell>
                </TableRow>
              ) : users.map((row) => (
                <TableRow key={row.id} hover sx={{ cursor: 'pointer' }} onClick={() => openEdit(row)}>
                  <TableCell sx={{ color: '#4A5568' }}>{row.id}</TableCell>
                  <TableCell sx={{ color: '#1A202C', maxWidth: 220 }}><TruncatedText>{fullName(row)}</TruncatedText></TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{row.username}</TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{ROLE_LABELS[row.role] || row.role}</TableCell>
                  <TableCell sx={{ color: '#4A5568', maxWidth: 180 }}><TruncatedText>{row.job_title || '—'}</TruncatedText></TableCell>
                  <TableCell sx={{ color: '#4A5568' }} onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={Boolean(row.is_active)}
                      onChange={() => handleToggleActive(row)}
                      disabled={row.username === currentUsername}
                      inputProps={{
                        'aria-label': row.is_active
                          ? `Деактивировать ${row.username}`
                          : `Активировать ${row.username}`,
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{formatDateTime(row.last_login)}</TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    <Tooltip title="Удалить пользователя">
                      <span>
                        <IconButton
                          size="small"
                          color="error"
                          aria-label={`Удалить пользователя ${row.username}`}
                          disabled={deletingId === row.id}
                          onClick={() => handleDelete(row)}
                        >
                          <span className="material-icons" style={{ fontSize: 20 }} aria-hidden="true">
                            delete
                          </span>
                        </IconButton>
                      </span>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={totalCount}
          page={page}
          onPageChange={(e, p) => setPage(p)}
          rowsPerPage={pageSize}
          onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
          rowsPerPageOptions={PAGE_SIZE_OPTIONS}
        />
      </Paper>

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{editingId ? 'Редактирование пользователя' : 'Создание пользователя'}</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {formError && (
            <Alert severity="error" role="alert" aria-live="assertive">
              {formError}
            </Alert>
          )}
          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField fullWidth label="Имя" name="first_name" value={formData.first_name} onChange={handleInputChange} />
            <TextField fullWidth label="Фамилия" name="last_name" value={formData.last_name} onChange={handleInputChange} />
          </Box>
          <TextField fullWidth label="Email" name="email" value={formData.email} onChange={handleInputChange} />
          <TextField fullWidth label="Логин" name="username" value={formData.username} onChange={handleInputChange} />
          <TextField
            fullWidth
            label={editingId ? 'Новый пароль (необязательно)' : 'Пароль'}
            name="password"
            type="password"
            value={formData.password}
            onChange={handleInputChange}
          />
          <SearchableSelect
            id="user-role"
            label="Роль"
            required
            value={formData.role}
            onChange={(value) => setFormData((prev) => ({
              ...prev,
              role: value,
              modules: value === 'seller'
                ? (prev.modules?.length ? prev.modules.filter((key) => GRANTABLE_MODULES.some((item) => item.key === key)) : [...SELLER_DEFAULT_MODULES])
                : prev.modules,
            }))}
            options={[
              { value: 'seller', label: 'Сотрудник' },
              { value: 'manager', label: 'Руководитель' },
            ]}
          />
          <TextField
            fullWidth
            label="Должность"
            name="job_title"
            placeholder="Например: Маркетолог"
            value={formData.job_title}
            onChange={handleInputChange}
          />
          {formData.role === 'manager' ? (
            <Alert severity="info">Руководителю доступны все разделы, удаление заказов и клиентов.</Alert>
          ) : (
            <Box>
              <FormLabel component="legend" sx={{ mb: 1 }}>Доступ к разделам</FormLabel>
              <FormGroup>
                {GRANTABLE_MODULES.map((item) => (
                  <FormControlLabel
                    key={item.key}
                    control={(
                      <Checkbox
                        checked={formData.modules.includes(item.key)}
                        onChange={() => setFormData((prev) => ({
                          ...prev,
                          modules: prev.modules.includes(item.key)
                            ? prev.modules.filter((key) => key !== item.key)
                            : [...prev.modules, item.key],
                        }))}
                      />
                    )}
                    label={item.label}
                  />
                ))}
              </FormGroup>
              <Typography variant="caption" sx={{ color: '#718096' }}>
                Сотрудник не может удалять заказы и клиентов. Пользователей и журнал может вести только руководитель.
              </Typography>
            </Box>
          )}
          <FormControlLabel
            control={
              <Switch
                checked={Boolean(formData.is_active)}
                disabled={Boolean(editingId) && formData.username === currentUsername}
                onChange={(e) => setFormData((prev) => ({ ...prev, is_active: e.target.checked }))}
              />
            }
            label="Активен"
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)} color="inherit">Отмена</Button>
          <Button onClick={handleSaveUser} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : (editingId ? 'Сохранить' : 'Создать')}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Users;
