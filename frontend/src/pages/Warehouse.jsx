import { Box, Typography, Paper, TextField, Button, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Chip, Select, MenuItem, TablePagination, Dialog, DialogTitle, DialogContent, DialogActions, CircularProgress, FormControl, InputLabel } from '@mui/material';
import { useEffect, useState } from 'react';
import api from '../api';
import { extractApiError, PAGE_SIZE } from '../utils';

const Warehouse = () => {
  const [stockItems, setStockItems] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({ product_card: '', stock_quantity: 0, stock_tag: '' });

  const fetchStock = () => {
    api.get('/warehouse/stock_items/')
      .then(res => setStockItems(res.data.results || res.data))
      .catch(err => console.error(err));
  };

  useEffect(() => {
    fetchStock();
  }, []);

  const handleInputChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleCreateStock = async () => {
    setLoading(true);
    try {
      await api.post('/warehouse/stock_items/', formData);
      setOpenModal(false);
      fetchStock();
    } catch (error) {
      console.error("Failed to add stock", error);
      alert(`Не удалось добавить приход:\n${extractApiError(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 1400, margin: '0 auto' }}>
      <Typography variant="h4" sx={{ mb: 4 }}>Склад (Остатки)</Typography>
      
      <Paper sx={{ p: 0, overflow: 'hidden' }}>
        <Box sx={{ p: 3, display: 'flex', gap: 2, alignItems: 'center', borderBottom: '1px solid #EDF2F7' }}>
          <TextField 
            placeholder="Поиск по артикулу или названию" 
            size="small"
            sx={{ width: 350 }}
          />
          <Select 
            value="" 
            displayEmpty 
            size="small" 
            sx={{ width: 200, color: '#718096' }}
          >
            <MenuItem value="">Все теги</MenuItem>
          </Select>
          <Box sx={{ flexGrow: 1 }} />
          <Button variant="outlined" sx={{ color: '#1A202C', borderColor: '#E2E8F0', padding: '6px 24px' }}>
            ПОИСК
          </Button>
          <Button variant="contained" color="primary" onClick={() => setOpenModal(true)}>
            ПРИХОД ТОВАРА +
          </Button>
        </Box>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Артикул</TableCell>
                <TableCell>Наименование</TableCell>
                <TableCell align="right">Остаток (шт)</TableCell>
                <TableCell>Срок годности</TableCell>
                <TableCell>Тег</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {stockItems.map((item) => (
                <TableRow key={item.id} hover sx={{ cursor: 'pointer' }}>
                  <TableCell sx={{ color: '#4A5568', fontWeight: 500 }}>{item.product_sku || '—'}</TableCell>
                  <TableCell sx={{ color: '#1A202C' }}>{item.product_name || `Товар #${item.product_card}`}</TableCell>
                  <TableCell align="right" sx={{ 
                    color: item.stock_quantity === 0 ? '#E53E3E' : (item.stock_quantity < 5 ? '#DD6B20' : '#38A169'), 
                    fontWeight: 600 
                  }}>
                    {item.stock_quantity}
                  </TableCell>
                  <TableCell sx={{ color: '#4A5568' }}>{item.expiry_date || '—'}</TableCell>
                  <TableCell>
                    {item.stock_tag ? (
                      <Chip 
                        label={item.stock_tag} 
                        sx={{ 
                          bgcolor: item.stock_tag === 'Заканчивается' ? '#FEEBC8' : (item.stock_tag === 'Нет в наличии' ? '#FED7D7' : '#EDF2F7'),
                          color: item.stock_tag === 'Заканчивается' ? '#DD6B20' : (item.stock_tag === 'Нет в наличии' ? '#E53E3E' : '#4A5568'),
                          fontWeight: 500,
                          height: 24,
                          fontSize: '0.75rem'
                        }} 
                      />
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
              {stockItems.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4, color: '#718096' }}>Нет товаров на складе</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
        
        <TablePagination
          component="div"
          count={stockItems.length}
          page={0}
          onPageChange={() => {}}
          rowsPerPage={PAGE_SIZE}
          onRowsPerPageChange={() => {}}
          rowsPerPageOptions={[PAGE_SIZE]}
        />
      </Paper>

      <Dialog open={openModal} onClose={() => setOpenModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Приход товара</DialogTitle>
        <DialogContent dividers sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          <TextField fullWidth label="ID Товара (Product Card)" name="product_card" type="number" value={formData.product_card} onChange={handleInputChange} />
          <TextField fullWidth label="Количество" name="stock_quantity" type="number" value={formData.stock_quantity} onChange={handleInputChange} />
          <FormControl fullWidth>
            <InputLabel>Тег</InputLabel>
            <Select name="stock_tag" value={formData.stock_tag} label="Тег" onChange={handleInputChange}>
              <MenuItem value="">Без тега</MenuItem>
              <MenuItem value="В наличии">В наличии</MenuItem>
              <MenuItem value="Заканчивается">Заканчивается</MenuItem>
              <MenuItem value="Нет в наличии">Нет в наличии</MenuItem>
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setOpenModal(false)} color="inherit">Отмена</Button>
          <Button onClick={handleCreateStock} variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={24} /> : 'Добавить'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Warehouse;
