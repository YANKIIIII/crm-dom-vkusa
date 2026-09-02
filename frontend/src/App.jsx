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
import Users from './pages/Users';
import AuditLog from './pages/AuditLog';
import References from './pages/References';

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
              <RoleRoute module="analytics" redirectTo="home">
                <Suspense fallback={null}>
                  <Dashboard />
                </Suspense>
              </RoleRoute>
            }
          />
          <Route path="orders" element={<RoleRoute module="orders"><Orders /></RoleRoute>} />
          <Route path="orders/:id" element={<RoleRoute module="orders"><OrderDetail /></RoleRoute>} />
          <Route path="clients" element={<RoleRoute module="clients"><Clients /></RoleRoute>} />
          <Route path="clients/:id" element={<RoleRoute module="clients"><ClientDetail /></RoleRoute>} />
          <Route path="warehouse" element={<RoleRoute module="warehouse"><Warehouse /></RoleRoute>} />
          <Route path="catalog" element={<Navigate to="/warehouse" replace />} />
          <Route path="references" element={<RoleRoute module="references"><References /></RoleRoute>} />
          <Route path="users" element={<RoleRoute module="users"><Users /></RoleRoute>} />
          <Route path="audit" element={<RoleRoute module="audit"><AuditLog /></RoleRoute>} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
