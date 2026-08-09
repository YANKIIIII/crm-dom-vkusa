import { Navigate } from 'react-router-dom';

const RoleRoute = ({ roles, children }) => {
  const role = localStorage.getItem('user_role');
  if (!role || !roles.includes(role)) {
    return <Navigate to="/orders" replace />;
  }
  return children;
};

export default RoleRoute;
