import { TableCell, TableSortLabel } from '@mui/material';

const SortableHeader = ({ field, label, ordering, onSort, align, defaultDesc = false }) => {
  const active = ordering === field || ordering === `-${field}`;
  const direction = ordering === `-${field}` ? 'desc' : 'asc';
  return (
    <TableCell align={align} sortDirection={active ? direction : false}>
      <TableSortLabel
        active={active}
        direction={active ? direction : 'asc'}
        onClick={() => onSort(field, defaultDesc)}
      >
        {label}
      </TableSortLabel>
    </TableCell>
  );
};

export default SortableHeader;
