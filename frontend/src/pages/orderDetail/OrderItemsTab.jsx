import {
  Box, Button, Checkbox, Grid, IconButton, InputAdornment, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import ProductPreviewTooltip from '../../components/ProductPreviewTooltip';
import SearchableSelect from '../../components/SearchableSelect';
import { formatCurrency } from '../../utils';

const OrderItemsTab = ({
  isNew,
  isTerminal,
  mutatingItems,
  saving,
  order,
  paymentSaving,
  paymentType,
  paymentTypes,
  paymentAmount,
  payments,
  paymentTypeName,
  orderTotal,
  paidTotal,
  remaining,
  onAddProduct,
  onQtyChange,
  onDeleteItem,
  onAddPayment,
  onDeletePayment,
  onPaymentTypeChange,
  onPaymentAmountChange,
}) => (
  <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
    <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3, minHeight: 300 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h5">Товар</Typography>
        <Button
          variant="outlined"
          color="secondary"
          sx={{ textTransform: 'uppercase' }}
          disabled={isTerminal || mutatingItems || saving}
          onClick={onAddProduct}
        >
          ДОБАВИТЬ ТОВАР +
        </Button>
      </Box>
      <TableContainer>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox size="small" disabled />
              </TableCell>
              <TableCell>ID товара / Артикул</TableCell>
              <TableCell>Кол-во</TableCell>
              <TableCell>Цена без НДС</TableCell>
              <TableCell>НДС %</TableCell>
              <TableCell align="right">Сумма с НДС</TableCell>
              <TableCell align="right">Действия</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {order.items && order.items.length > 0 ? (
              order.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell padding="checkbox">
                    <Checkbox size="small" disabled />
                  </TableCell>
                  <TableCell>
                    <ProductPreviewTooltip product={item}>
                      <Box>
                        <Typography variant="body2">{item.product_name}</Typography>
                        <Typography variant="caption" sx={{
                          color: "text.secondary"
                        }}>
                          {item.product_sku}
                        </Typography>
                      </Box>
                    </ProductPreviewTooltip>
                  </TableCell>
                  <TableCell sx={{ minWidth: 100 }}>
                    {isTerminal ? (
                      `${item.quantity} шт.`
                    ) : (
                      <TextField
                        size="small"
                        type="number"
                        slotProps={{ htmlInput: { min: 1, style: { width: 64 } } }}
                        defaultValue={item.quantity}
                        key={`${item.id}-${item.quantity}`}
                        disabled={mutatingItems}
                        onBlur={(e) => onQtyChange(item, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.target.blur();
                          }
                        }}
                      />
                    )}
                  </TableCell>
                  <TableCell>{formatCurrency(item.price)}</TableCell>
                  <TableCell>{item.vat_rate}%</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>
                    {formatCurrency(item.line_total)}
                  </TableCell>
                  <TableCell align="right">
                    <Button
                      size="small"
                      color="error"
                      disabled={isTerminal || mutatingItems}
                      onClick={() => onDeleteItem(item)}
                    >
                      Удалить
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 3, color: '#718096' }}>
                  Нет добавленных товаров
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>

    <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3 }}>
      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          mb: 3,
        }}
      >
        <Typography variant="h5">Оплата</Typography>
        <Button
          variant="outlined"
          color="secondary"
          sx={{ textTransform: 'uppercase' }}
          disabled={isTerminal || isNew || paymentSaving}
          onClick={onAddPayment}
        >
          ДОБАВИТЬ ОПЛАТУ +
        </Button>
      </Box>

      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={5}>
          <SearchableSelect
            id="order-payment-type"
            label="Способ оплаты"
            placeholder="Способ оплаты"
            disabled={isTerminal || isNew}
            value={paymentType}
            onChange={onPaymentTypeChange}
            options={paymentTypes.map((pt) => ({ value: pt.id, label: pt.name }))}
          />
        </Grid>
        <Grid size={5}>
          <TextField
            fullWidth
            size="small"
            placeholder="Сумма, BYN"
            type="number"
            value={paymentAmount}
            disabled={isTerminal || isNew}
            onChange={(e) => onPaymentAmountChange(e.target.value)}
            slotProps={{
              input: {
                endAdornment: (
                  <InputAdornment position="end">BYN</InputAdornment>
                ),
              },
            }}
          />
        </Grid>
      </Grid>

      {payments.length > 0 ? (
        <TableContainer sx={{ mb: 3 }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Способ оплаты</TableCell>
                <TableCell align="right">Сумма</TableCell>
                <TableCell align="right">Действия</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {payments.map((p) => (
                <TableRow key={p.id || p.tempId} sx={p.tempId ? { fontStyle: 'italic', bgcolor: '#FFFBF0' } : undefined}>
                  <TableCell>
                    {paymentTypeName(p.payment_type)}
                    {p.tempId && (
                      <Typography component="span" variant="caption" sx={{ ml: 1, color: '#B7791F' }}>
                        (не сохранено)
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{formatCurrency(p.amount)}</TableCell>
                  <TableCell align="right">
                    <IconButton
                      size="small"
                      color="error"
                      disabled={isTerminal || paymentSaving}
                      onClick={() => onDeletePayment(p)}
                      title="Удалить оплату"
                    >
                      <span className="material-icons" style={{ fontSize: 18 }}>delete</span>
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      ) : (
        <Typography
          variant="body2"
          sx={{
            color: "text.secondary",
            mb: 3
          }}>
          Платежей пока нет
        </Typography>
      )}

      <Box
        sx={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid #EDF2F7',
          pt: 3,
          mt: 2,
          flexWrap: 'wrap',
          gap: 2,
        }}
      >
        <Typography variant="h4" sx={{ display: 'flex', gap: 2, alignItems: 'baseline' }}>
          Итого:{' '}
          <Box component="span" sx={{ color: '#CC5E33', fontWeight: 600 }}>
            {formatCurrency(orderTotal)}
          </Box>
        </Typography>
        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body1">
            Оплачено:{' '}
            <Box component="span" sx={{ fontWeight: 600 }}>
              {formatCurrency(paidTotal)}
            </Box>
          </Typography>
          <Typography variant="body2" sx={{
            color: "text.secondary"
          }}>
            Остаток: {formatCurrency(remaining)}
          </Typography>
        </Box>
      </Box>
    </Box>
  </Box>
);

export default OrderItemsTab;
