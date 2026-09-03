import { Box, Button, Grid, IconButton, TextField, Tooltip, Typography } from '@mui/material';
import SearchableSelect from '../../components/SearchableSelect';
import { formatUserName } from './utils';

const OrderDataTab = ({
  isNew,
  isTerminal,
  order,
  channels,
  sellers,
  isManager,
  saving,
  orderStatuses,
  mutatingDeliveries,
  deliveryRows,
  deliveryServices,
  clientDisplayName,
  clientPhones,
  phoneSaving,
  draftPhone,
  onChange,
  onStatusChange,
  onAddDelivery,
  onDeliveryServiceChange,
  onDeliveryTrackingBlur,
  onDeliveryDateBlur,
  onDeleteDelivery,
  onAddPhone,
  onOpenClientPicker,
  onRemoveClient,
  onPersistPhone,
  onDraftPhoneChange,
}) => (
  <Box sx={{ p: 4, display: 'flex', flexDirection: 'column', gap: 4 }}>
    <Box sx={{ border: '1px solid #EDF2F7', borderRadius: 3, p: 3 }}>
      <Typography variant="h5" sx={{ mb: 3 }}>
        {isNew ? 'Новый заказ' : `Заказ ${order.order_number}`}
      </Typography>
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid size={{ xs: 12, md: 3 }}>
          <TextField
            fullWidth
            size="small"
            type="date"
            required
            label="Дата заказа"
            slotProps={{ inputLabel: { shrink: true } }}
            value={order.order_date || ''}
            onChange={(e) => onChange('order_date', e.target.value)}
            disabled={isTerminal}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SearchableSelect
            id="order-sales-channel"
            label="Канал привлечения"
            placeholder="Выберите канал"
            value={order.sales_channel || ''}
            onChange={(value) => onChange('sales_channel', value)}
            options={channels.map((c) => ({ value: c.id, label: c.name }))}
            disabled={isTerminal}
          />
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          {isManager ? (
            <SearchableSelect
              id="order-seller"
              label="Продавец"
              placeholder="Выберите продавца"
              value={order.seller || ''}
              onChange={(value) => onChange('seller', value)}
              options={sellers.map((u) => ({ value: u.id, label: formatUserName(u) }))}
              disabled={isTerminal}
            />
          ) : (
            <TextField
              fullWidth
              size="small"
              label="Продавец"
              value={order.seller_name || ''}
              slotProps={{ inputLabel: { shrink: true } }}
              disabled
            />
          )}
        </Grid>
        <Grid size={{ xs: 12, md: 3 }}>
          <SearchableSelect
            id="order-status"
            label="Статус"
            required
            filterable={false}
            disabled={saving || isTerminal}
            value={order.status || 'reserved'}
            onChange={onStatusChange}
            options={orderStatuses.map((s) => ({ value: s.value, label: s.label }))}
          />
        </Grid>
      </Grid>
      <TextField
        fullWidth
        size="small"
        label="Примечание"
        value={order.comment || ''}
        onChange={(e) => onChange('comment', e.target.value)}
      />
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
        <Typography variant="h5">Доставка</Typography>
        <Button
          variant="outlined"
          color="secondary"
          sx={{ textTransform: 'uppercase' }}
          disabled={isTerminal || mutatingDeliveries}
          onClick={onAddDelivery}
        >
          ДОБАВИТЬ ДОСТАВКУ +
        </Button>
      </Box>
      {deliveryRows.length === 0 ? (
        <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2 }}>
          Доставка не указана
        </Typography>
      ) : (
        deliveryRows.map((row) => (
          <Grid
            container
            spacing={2}
            wrap="nowrap"
            alignItems="center"
            key={row.id || row.tempId}
            sx={{ mb: 2 }}
          >
            <Grid size={4}>
              <SearchableSelect
                id={`order-delivery-service-${row.id || row.tempId}`}
                label="Способ доставки"
                disabled={isTerminal || mutatingDeliveries}
                value={row.delivery_service || ''}
                onChange={(value) => onDeliveryServiceChange(row, value || null)}
                options={deliveryServices.map((ds) => ({ value: ds.id, label: ds.name }))}
                disableClearable
              />
            </Grid>
            <Grid size={3}>
              <TextField
                fullWidth
                size="small"
                label="Трек-номер"
                defaultValue={row.tracking_number || ''}
                key={`${row.id || row.tempId}-${row.tracking_number || ''}`}
                disabled={isTerminal || mutatingDeliveries}
                onBlur={(e) => onDeliveryTrackingBlur(row, e.target.value)}
              />
            </Grid>
            <Grid size={3}>
              <TextField
                fullWidth
                size="small"
                type="date"
                label="Дата доставки"
                defaultValue={row.delivery_date || ''}
                key={`${row.id || row.tempId}-date-${row.delivery_date || ''}`}
                disabled={isTerminal || mutatingDeliveries}
                onBlur={(e) => onDeliveryDateBlur(row, e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
              />
            </Grid>
            <Grid size="auto" sx={{ flexShrink: 0 }}>
              <Button
                size="small"
                color="error"
                disabled={isTerminal || mutatingDeliveries}
                onClick={() => onDeleteDelivery(row)}
              >
                Удалить
              </Button>
            </Grid>
          </Grid>
        ))
      )}
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
        <Typography variant="h5">Клиент</Typography>
        <Box sx={{ display: 'flex', gap: 2 }}>
          <Button
            variant="outlined"
            color="secondary"
            sx={{ textTransform: 'uppercase' }}
            disabled={isTerminal}
            onClick={onAddPhone}
          >
            ДОБАВИТЬ ТЕЛЕФОН +
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            sx={{ textTransform: 'uppercase' }}
            disabled={isTerminal}
            onClick={onOpenClientPicker}
          >
            ВЫБРАТЬ КЛИЕНТА +
          </Button>
        </Box>
      </Box>
      <Grid container spacing={3} alignItems="flex-start">
        <Grid size={4}>
          <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'flex-start' }}>
            <TextField
              fullWidth
              size="small"
              label="ФИО"
              disabled
              value={clientDisplayName}
            />
            {order.client && !isTerminal && (
              <>
                <Tooltip title="Сменить клиента">
                  <IconButton size="small" onClick={onOpenClientPicker} sx={{ mt: 0.5 }}>
                    <span className="material-icons" style={{ fontSize: 20 }}>swap_horiz</span>
                  </IconButton>
                </Tooltip>
                <Tooltip title="Убрать клиента">
                  <IconButton size="small" color="error" onClick={onRemoveClient} sx={{ mt: 0.5 }}>
                    <span className="material-icons" style={{ fontSize: 20 }}>close</span>
                  </IconButton>
                </Tooltip>
              </>
            )}
          </Box>
        </Grid>
        <Grid size={4}>
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
            {clientPhones.map((phone, index) => (
              <TextField
                key={phone.id}
                fullWidth
                size="small"
                label={index === 0 ? 'Телефон' : `Телефон ${index + 1}`}
                placeholder="+375..."
                disabled={isTerminal || phoneSaving}
                defaultValue={phone.number}
                onBlur={(e) => {
                  const next = e.target.value.trim();
                  if (!next || next === phone.number) return;
                  onPersistPhone(phone.id, next);
                }}
              />
            ))}
            {(draftPhone !== null || (order.client && clientPhones.length === 0)) && (
              <TextField
                fullWidth
                size="small"
                label={clientPhones.length === 0 ? 'Телефон' : `Телефон ${clientPhones.length + 1}`}
                placeholder="+375..."
                autoFocus={draftPhone !== null}
                disabled={isTerminal || phoneSaving}
                value={draftPhone ?? ''}
                onChange={(e) => onDraftPhoneChange(e.target.value)}
                onBlur={() => {
                  if (draftPhone?.trim()) onPersistPhone(null, draftPhone);
                }}
              />
            )}
            {!order.client && clientPhones.length === 0 && draftPhone === null && (
              <TextField
                fullWidth
                size="small"
                label="Телефон"
                placeholder="+375..."
                disabled
                value=""
              />
            )}
          </Box>
        </Grid>
        <Grid size={4}>
          <TextField
            fullWidth
            size="small"
            label="Скидка (%)"
            type="number"
            value={order.discount_percent || 0}
            onChange={(e) => onChange('discount_percent', e.target.value)}
            disabled={isTerminal}
          />
        </Grid>
      </Grid>
    </Box>
  </Box>
);

export default OrderDataTab;
