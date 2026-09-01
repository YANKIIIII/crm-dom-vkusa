import { Autocomplete, TextField } from '@mui/material';

const SearchableSelect = ({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  disabled = false,
  required = false,
  size = 'small',
  disableClearable,
  inputRef,
  filterable = true,
}) => {
  const selected = options.find((opt) => String(opt.value) === String(value ?? '')) ?? null;
  return (
    <Autocomplete
      id={id}
      size={size}
      options={options}
      value={selected}
      disabled={disabled}
      disableClearable={disableClearable ?? Boolean(required)}
      selectOnFocus={false}
      handleHomeEndKeys={filterable}
      getOptionLabel={(opt) => opt?.label ?? ''}
      isOptionEqualToValue={(a, b) => String(a?.value) === String(b?.value)}
      filterOptions={filterable ? undefined : (opts) => opts}
      onChange={(_, next) => onChange(next ? next.value : '')}
      sx={{ width: '100%' }}
      slotProps={{
        popper: { sx: { zIndex: 2000 } },
      }}
      renderInput={(params) => (
        <TextField
          {...params}
          label={label}
          required={required}
          placeholder={placeholder}
          inputRef={inputRef}
          inputProps={{
            ...params.inputProps,
            readOnly: !filterable,
          }}
        />
      )}
    />
  );
};

export default SearchableSelect;
