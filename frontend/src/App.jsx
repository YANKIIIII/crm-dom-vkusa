import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout/Layout';
import RoleRoute from './components/RoleRoute';
import Login from './pages/Login';
import Orders from './pages/Orders';
import OrderDetail from './pages/OrderDetail';
import Clients from './pages/Clients';
import ClientDetail from './pages/ClientDetail';
import Warehouse from './pages/Warehouse';
import Catalog from './pages/Catalog';
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';

const Dashboard = lazy(() => import('./pages/Dashboard'));

// Protected Route wrapper
const ProtectedRoute = ({ children }) => {
  const isAuthenticated = !!localStorage.getItem('access_token');
  return isAuthenticated ? children : <Navigate to="/login" />;
};


function App() {
  return (
    <Router>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route 
          path="/" 
          element={
            <ProtectedRoute>
              <Layout />
            </ProtectedRoute>
          } 
        >
          {/* Outlet routes rendered inside Layout */}
          <Route
            index
            element={
              <RoleRoute roles={['manager']}>
                <Suspense fallback={null}>
                  <Dashboard />
                </Suspense>
              </RoleRoute>
            }
          />
          <Route path="orders" element={<Orders />} />
          <Route path="orders/:id" element={<OrderDetail />} />
          <Route path="clients" element={<Clients />} />
          <Route path="clients/:id" element={<ClientDetail />} />
          <Route path="warehouse" element={<Warehouse />} />
          <Route path="catalog" element={<Catalog />} />
          <Route path="users" element={<RoleRoute roles={['manager']}><Users /></RoleRoute>} />
          <Route path="audit" element={<RoleRoute roles={['manager']}><AuditLog /></RoleRoute>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
