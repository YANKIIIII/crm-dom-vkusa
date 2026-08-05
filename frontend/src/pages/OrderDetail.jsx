import { Box, Paper, Grid, Typography, Button, TextField, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Select, MenuItem, Checkbox, Dialog, DialogTitle, DialogContent, DialogActions, Autocomplete } from '@mui/material';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api';
import { extractApiError } from '../utils';
import ProductSearchModal from '../components/ProductSearchModal';

const ORDER_STATUSES = [
  { value: 'reserved', label: 'Резерв' },
  { value: 'confirmed', label: 'Подтвержден' },
  { value: 'in_delivery', label: 'В доставке' },
  { value: 'completed', label: 'Завершен' },
  { value: 'cancelled', label: 'Отменен' },
];

const OrderDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0); 

  const [order, setOrder] = useState(null);
  const [channels, setChannels] = useState([]);
  const [deliveryServices, setDeliveryServices] = useState([]);
  const [paymentTypes, setPaymentTypes] = useState([]);
  
  // States for placeholder modals
  const [openPaymentModal, setOpenPaymentModal] = useState(false);
  const [openClientModal, setOpenClientModal] = useState(false);
  const [openPhoneModal, setOpenPhoneModal] = useState(false);
  
  // State for Add Product Dialog
  const [openProductDialog, setOpenProductDialog] = useState(false);
  const [catalogProducts, setCatalogProducts] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [quantity, setQuantity] = useState(1);
  const [price, setPrice] = useState(0);

  const fetchOrderData = async () => {
    try {
      const [channelRes, deliveryRes, paymentRes, productsRes] = await Promise.all([
        api.get('/orders/sales_channels/').catch(() => ({ data: [] })),
        api.get('/orders/delivery_services/').catch(() => ({ data: [] })),
        api.get('/orders/payment_types/').catch(() => ({ data: [] })),
        api.get('/catalog/product_cards/').catch(() => ({ data: [] }))
      ]);
      setChannels(channelRes.data.results || channelRes.data || []);
      setDeliveryServices(deliveryRes.data.results || deliveryRes.data || []);
      setPaymentTypes(paymentRes.data.results || paymentRes.data || []);
      setCatalogProducts(productsRes.data.results || productsRes.data || []);

      if (id !== 'new') {
        const orderRes = await api.get(`/orders/orders/${id}/`);
        setOrder(orderRes.data);
      } else {
        setOrder({ items: [] });
      }
    } catch (err) {
      console.error("Error fetching order data:", err);
      if (id === 'new') setOrder({ items: [] });
    }
  };

  useEffect(() => {
    if (id) fetchOrderData();
  }, [id]);

  const handleChange = (field, value) => {
    setOrder(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      if (id === 'new') {
        const res = await api.post(`/orders/orders/`, order);
        alert('Новый заказ создан');
        navigate(`/orders/${res.data.id}`);
      } else {
        await api.put(`/orders/orders/${id}/`, order);
        alert('Заказ сохранен');
      }
    } catch (err) {
      console.error(err);
      alert(`Ошибка при сохранении:\n${extractApiError(err)}`);
    }
  };

  const handleAddProducts = async (selectedProducts) => {
    if (id === 'new') {
      alert('Сначала сохраните заказ, чтобы добавлять в него товары');
      return;
    }
    try {
      const promises = selectedProducts.map(product => {
        const price = product.rrp ? parseFloat(product.rrp) : parseFloat(product.base_cost_price) * 1.5;
        const itemData = {
          order: id,
          product_card: product.id,
          quantity: 1, // Default quantity
          price: price,
          cost_price: product.base_cost_price,
          vat_rate: 20
        };
        return api.post('/orders/order_items/', itemData);
      });
      
      await Promise.all(promises);
      fetchOrderData(); // refresh order to show new items
    } catch (err) {
      console.error('Failed to add products', err);
      alert(`Ошибка при добавлении товаров:\n${extractApiError(err)}`);
      fetchOrderData(); // some items may have been added before the failure
    }
  };

  if (!order) return <Box sx={{ p: 4 }}><Typography>Загрузка...</Typography></Box>;

  return (
    <Box sx={{ maxWidth: 1200, margin: '0 auto', pb: 10 }}>
      <Paper sx={{ p: 0, overflow: 'hidden', borderRadius: 4 }}>
        
        {/* Top Header / Tabs */}
        <Box sx={{ p: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #EDF2F7' }}>
          <Box sx={{ display: 'flex', gap: 2 }}>
            <Button 
              variant={tab === 0 ? "outlined" : "text"} 
              onClick={() => setTab(0)}
              sx={{ 
                borderRadius: 8, 
                borderColor: tab === 0 ? '#E2E8F0' : 'transparent',
                color: tab === 0 ? '#1A202C' : '#718096',
                fontWeight: tab === 0 ? 600 : 400,
                textTransform: 'none',
                px: 3,
                py: 1
              }}
            >
              Данные о заказе
            </Button>
            <Button 
              variant={tab === 1 ? "outlined" : "text"} 
              onClick={() => setTab(1)}
              sx={{ 
                borderRadius: 8, 
                borderColor: tab === 1 ? '#E2E8F0' : 'transparent',
                color: tab === 1 ? '#1A202C' : '#718096',
                fontWeight: tab === 1 ? 600 : 400,
                textTransform: 'none',
                px: 3,
                py: 1
              }}
            >
              Товары и оплата
            </Button>
          </Box>
          <Button variant="contained" color="primary" onClick={handleSave}>
            СОХРАНИТЬ ЗАКАЗ
          </Button>
        </Box>

        {/* TAB 0: Данные о заказе */}
        {tab === 0 && (
          <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            
            {/* Заказ Section */}
            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3 }}>
              <Typography variant="h5" sx={{ mb: 3 }}>Заказ {order.order_number}</Typography>
              <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Дата заказа</Typography>
                  <TextField 
                    fullWidth 
                    size="small" 
                    type="date"
                    value={order.order_date || ''} 
                    onChange={(e) => handleChange('order_date', e.target.value)}
                  />
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Канал привлечения</Typography>
                  <Select 
                    fullWidth 
                    size="small" 
                    value={order.sales_channel || ''}
                    onChange={(e) => handleChange('sales_channel', e.target.value)}
                  >
                    {channels.map(c => (
                      <MenuItem key={c.id} value={c.id}>{c.name}</MenuItem>
                    ))}
                  </Select>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Статус</Typography>
                  <Select 
                    fullWidth 
                    size="small" 
                    value={order.status || ''}
                    onChange={(e) => handleChange('status', e.target.value)}
                  >
                    {ORDER_STATUSES.map(s => (
                      <MenuItem key={s.value} value={s.value}>{s.label}</MenuItem>
                    ))}
                  </Select>
                </Grid>
              </Grid>
              <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Примечание</Typography>
              <TextField 
                fullWidth 
                size="small" 
                value={order.comment || ''}
                onChange={(e) => handleChange('comment', e.target.value)}
              />
            </Box>

            {/* Доставка Section */}
            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">Доставка</Typography>
                <Button variant="outlined" color="secondary" sx={{ textTransform: 'uppercase' }}>
                  ДОБАВИТЬ ДОСТАВКУ +
                </Button>
              </Box>
              <Grid container spacing={3}>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Способ доставки</Typography>
                  <Select 
                    fullWidth 
                    size="small" 
                    value={order.delivery_service || ''}
                    onChange={(e) => handleChange('delivery_service', e.target.value)}
                  >
                    {deliveryServices.map(ds => (
                      <MenuItem key={ds.id} value={ds.id}>{ds.name}</MenuItem>
                    ))}
                  </Select>
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Трек-номер</Typography>
                  <TextField 
                    fullWidth 
                    size="small" 
                    value={order.tracking_number || ''}
                    onChange={(e) => handleChange('tracking_number', e.target.value)}
                  />
                </Grid>
                <Grid item xs={4}>
                  <Typography variant="caption" color="text.secondary" sx={{ ml: 1, mb: 0.5, display: 'block' }}>Дата доставки (окончания)</Typography>
                  <TextField 
                    fullWidth 
                    size="small" 
                    type="date"
                    value={order.completed_at ? order.completed_at.substring(0, 10) : ''}
                    onChange={(e) => handleChange('completed_at', e.target.value)}
                  />
                </Grid>
              </Grid>
            </Box>

            {/* Клиент Section */}
            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">Клиент</Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                  <Button variant="outlined" color="secondary" sx={{ textTransform: 'uppercase' }} onClick={() => setOpenPhoneModal(true)}>
                    ДОБАВИТЬ ДОП. ТЕЛЕФОН +
                  </Button>
                  <Button variant="outlined" color="secondary" sx={{ textTransform: 'uppercase' }} onClick={() => setOpenClientModal(true)}>
                    ВЫБРАТЬ КЛИЕНТА +
                  </Button>
                </Box>
              </Box>
              <Grid container spacing={3}>
                <Grid item xs={4}>
                  <TextField 
                    fullWidth 
                    size="small" 
                    label="ФИО (чтение)" 
                    disabled 
                    value={order.client_name ? `${order.client_name} ${order.client_last_name || ''}` : 'Не выбран'} 
                  />
                </Grid>
                <Grid item xs={4}>
                  <TextField 
                    fullWidth 
                    size="small" 
                    label="Скидка клиента (%)" 
                    type="number"
                    value={order.discount_percent || 0}
                    onChange={(e) => handleChange('discount_percent', e.target.value)}
                  />
                </Grid>
              </Grid>
            </Box>

          </Box>
        )}

        {/* TAB 1: Товары и оплата */}
        {tab === 1 && (
          <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
            
            {/* Товар Section */}
            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3, minHeight: 300 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">Товар</Typography>
                <Button variant="outlined" color="secondary" sx={{ textTransform: 'uppercase' }} onClick={() => setOpenProductDialog(true)}>
                  ДОБАВИТЬ ТОВАР +
                </Button>
              </Box>
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell padding="checkbox"><Checkbox size="small" /></TableCell>
                      <TableCell>ID товара / Артикул</TableCell>
                      <TableCell>Кол-во</TableCell>
                      <TableCell>Цена без НДС</TableCell>
                      <TableCell>НДС %</TableCell>
                      <TableCell align="right">Сумма с НДС</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {order.items && order.items.length > 0 ? (
                      order.items.map(item => (
                        <TableRow key={item.id}>
                          <TableCell padding="checkbox"><Checkbox size="small" /></TableCell>
                          <TableCell>
                            <Box>
                              <Typography variant="body2">{item.product_name}</Typography>
                              <Typography variant="caption" color="text.secondary">{item.product_sku}</Typography>
                            </Box>
                          </TableCell>
                          <TableCell>{item.quantity} шт.</TableCell>
                          <TableCell>{item.price} BYN</TableCell>
                          <TableCell>{item.vat_rate}%</TableCell>
                          <TableCell align="right" sx={{ fontWeight: 600 }}>{item.line_total} BYN</TableCell>
                        </TableRow>
                      ))
                    ) : (
                      <TableRow>
                        <TableCell colSpan={6} align="center" sx={{ py: 3, color: '#718096' }}>Нет добавленных товаров</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </TableContainer>
            </Box>

            {/* Оплата Section */}
            <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h5">Оплата</Typography>
                <Button variant="outlined" color="secondary" sx={{ textTransform: 'uppercase' }} onClick={() => setOpenPaymentModal(true)}>
                  ДОБАВИТЬ ОПЛАТУ +
                </Button>
              </Box>
              <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={5}>
                  <Select 
                    fullWidth 
                    size="small" 
                    displayEmpty 
                    value=""
                  >
                    <MenuItem value="" disabled>Способ оплаты</MenuItem>
                    {paymentTypes.map(pt => (
                      <MenuItem key={pt.id} value={pt.id}>{pt.name}</MenuItem>
                    ))}
                  </Select>
                </Grid>
                <Grid item xs={5}>
                  <TextField fullWidth size="small" placeholder="BYN" />
                </Grid>
              </Grid>

              {/* Totals */}
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #EDF2F7', pt: 3, mt: 2 }}>
                <Typography variant="h4" sx={{ display: 'flex', gap: 2 }}>
                  Итого: <Box component="span" sx={{ color: '#CC5E33', fontWeight: 600 }}>{order.total || 0} BYN</Box>
                </Typography>
              </Box>
            </Box>

          </Box>
        )}

      </Paper>

      <ProductSearchModal 
        open={openProductDialog} 
        onClose={() => setOpenProductDialog(false)} 
        onAdd={handleAddProducts}
        categories={catalogProducts.map(p => p.category_name ? {id: p.category, name: p.category_name} : null).filter((v,i,a)=>a.findIndex(t=>(t && t.id === v.id))===i && v)} // Extract categories from loaded products or ideally load from API
      />

      <Dialog open={openPaymentModal} onClose={() => setOpenPaymentModal(false)}>
        <DialogTitle>Добавить оплату</DialogTitle>
        <DialogContent><Typography>В разработке</Typography></DialogContent>
      </Dialog>

      <Dialog open={openClientModal} onClose={() => setOpenClientModal(false)}>
        <DialogTitle>Выбрать клиента</DialogTitle>
        <DialogContent><Typography>В разработке</Typography></DialogContent>
      </Dialog>

      <Dialog open={openPhoneModal} onClose={() => setOpenPhoneModal(false)}>
        <DialogTitle>Добавить доп. телефон</DialogTitle>
        <DialogContent><Typography>В разработке</Typography></DialogContent>
      </Dialog>
    </Box>
  );
};

export default OrderDetail;
