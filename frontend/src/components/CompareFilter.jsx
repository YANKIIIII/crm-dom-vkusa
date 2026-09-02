import { useRef, useState } from 'react';
import {
  Box,
  Divider,
  FormControl,
  InputAdornment,
  InputBase,
  InputLabel,
  MenuItem,
  OutlinedInput,
  Popover,
  Select,
} from '@mui/material';
import MonthCalendar from './MonthCalendar';

const ALL_OP = 'all';

const COMPARE_OPTIONS = [
  { value: ALL_OP, label: 'Все' },
  { value: 'gte', label: 'От' },
  { value: 'lte', label: 'До' },
  { value: 'between', label: 'Между' },
];

const valueInputSx = {
  flex: '0 0 auto',
  fontSize: '0.8125rem',
  '& input': {
    py: 0.75,
    px: 0.75,
    height: 24,
  },
  '& input[type=number]': {
    MozAppearance: 'textfield',
  },
  '& input::-webkit-outer-spin-button, & input::-webkit-inner-spin-button': {
    WebkitAppearance: 'none',
    margin: 0,
  },
};

const datePlaceholder = 'дд.мм.гггг';

const formatDateRu = (iso) => {
  if (!iso) return '';
  const [year, month, day] = iso.split('-');
  if (!year || !month || !day) return '';
  return `${day}.${month}.${year}`;
};

const CompareFilter = ({
  id,
  label,
  op,
  onOpChange,
  value,
  onValueChange,
  valueTo,
  onValueToChange,
  onRangeChange,
  type = 'text',
}) => {
  const [focused, setFocused] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const dateAnchorRef = useRef(null);
  const showValue = Boolean(op);
  const showSecond = op === 'between';
  const isDate = type === 'date';
  const labelId = `${id}-op-label`;
  const dateLabel = showSecond
    ? `${formatDateRu(value) || datePlaceholder} – ${formatDateRu(valueTo) || datePlaceholder}`
    : (formatDateRu(value) || datePlaceholder);

  return (
    <FormControl
      size="small"
      variant="outlined"
      focused={focused || menuOpen || calendarOpen}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (calendarOpen || menuOpen) return;
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
      sx={{
        flexShrink: 0,
        minWidth: showSecond
          ? (isDate ? 228 : 196)
          : showValue
            ? (isDate ? 188 : 156)
            : (isDate ? 150 : 118),
      }}
    >
      <InputLabel id={labelId} shrink htmlFor={`${id}-value`}>
        {label}
      </InputLabel>
      <OutlinedInput
        notched
        label={label}
        readOnly
        value=""
        inputProps={{
          tabIndex: -1,
          'aria-hidden': true,
        }}
        startAdornment={(
          <InputAdornment position="start" sx={{ m: 0, maxWidth: '100%' }}>
            <Box sx={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: 40 }}>
              <Select
                variant="standard"
                disableUnderline
                id={`${id}-op`}
                labelId={labelId}
                value={op || ALL_OP}
                open={menuOpen}
                onOpen={() => setMenuOpen(true)}
                onClose={() => setMenuOpen(false)}
                onChange={(e) => {
                  const next = e.target.value === ALL_OP ? '' : e.target.value;
                  onOpChange(next);
                  if (!next) setCalendarOpen(false);
                }}
                sx={{
                  minWidth: 68,
                  flexShrink: 0,
                  '& .MuiSelect-select': {
                    py: 1,
                    pl: 0.5,
                    pr: '20px !important',
                    fontSize: '0.8125rem',
                    display: 'flex',
                    alignItems: 'center',
                  },
                  '&:before, &:after': { display: 'none' },
                }}
              >
                {COMPARE_OPTIONS.map((opt) => (
                  <MenuItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </MenuItem>
                ))}
              </Select>
              {showValue && isDate && (
                <>
                  <Divider orientation="vertical" flexItem sx={{ my: 1 }} />
                  <Box
                    ref={dateAnchorRef}
                    id={`${id}-value`}
                    role="button"
                    tabIndex={0}
                    aria-label={label}
                    aria-haspopup="dialog"
                    onClick={() => setCalendarOpen(true)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setCalendarOpen(true);
                      }
                    }}
                    sx={{
                      flex: 1,
                      minWidth: showSecond ? 132 : 88,
                      px: 0.75,
                      fontSize: '0.8125rem',
                      color: value ? 'text.primary' : 'text.secondary',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {dateLabel}
                  </Box>
                </>
              )}
              {showValue && !isDate && (
                <>
                  <Divider orientation="vertical" flexItem sx={{ my: 1 }} />
                  <InputBase
                    id={`${id}-value`}
                    type={type}
                    value={value}
                    onChange={(e) => onValueChange(e.target.value)}
                    placeholder={showSecond ? 'от' : undefined}
                    sx={{ ...valueInputSx, width: 64, minWidth: 64 }}
                    inputProps={{
                      min: 0,
                      'aria-label': showSecond ? `${label} от` : label,
                    }}
                  />
                </>
              )}
              {showSecond && !isDate && (
                <>
                  <Box component="span" sx={{ color: 'text.secondary', px: 0.25 }}>
                    –
                  </Box>
                  <InputBase
                    type={type}
                    value={valueTo}
                    onChange={(e) => onValueToChange(e.target.value)}
                    placeholder="до"
                    sx={{ ...valueInputSx, width: 64, minWidth: 64 }}
                    inputProps={{
                      min: 0,
                      'aria-label': `${label} до`,
                    }}
                  />
                </>
              )}
            </Box>
          </InputAdornment>
        )}
        sx={{
          height: 40,
          boxSizing: 'border-box',
          paddingRight: '4px',
          alignItems: 'center',
          '& .MuiOutlinedInput-input': {
            width: 0,
            minWidth: 0,
            padding: 0,
            height: 0,
            opacity: 0,
          },
        }}
      />
      <Popover
        open={calendarOpen}
        anchorEl={dateAnchorRef.current}
        onClose={() => setCalendarOpen(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
        slotProps={{
          paper: {
            sx: {
              mt: 1,
              borderRadius: 2,
              bgcolor: '#FFFFFF',
              backgroundImage: 'none',
              boxShadow: '0px 8px 24px rgba(26, 32, 44, 0.16)',
            },
          },
        }}
      >
        <MonthCalendar
          range={showSecond}
          value={value}
          valueTo={valueTo}
          onSelect={(from, to) => {
            if (onRangeChange) onRangeChange(from, to);
            else {
              onValueChange?.(from);
              onValueToChange?.(to);
            }
            if (!showSecond || (from && to)) setCalendarOpen(false);
          }}
        />
      </Popover>
    </FormControl>
  );
};

export default CompareFilter;
