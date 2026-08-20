import { Navigate } from 'react-router-dom';
import { useAuth } from './AuthContext.jsx';

const HOME_BY_ROLE = {
  admin: '/admin',
  supplier: '/pipeline',
  buyer: '/buyer/dynamic-discounting',
  funder: '/funder/portfolio',
};

// Wraps a page and only renders it if someone is logged in - and, if a role
// list was given, only if their role is on it.
//
//   <ProtectedRoute><Dashboard /></ProtectedRoute>              any logged-in user
//   <ProtectedRoute roles={['admin']}><Admin /></ProtectedRoute> admins only
function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  // Still checking whether the saved token is valid - show nothing rather
  // than flash the login page for a moment before redirecting back.
  if (loading) {
    return null;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user.role)) {
    // Logged in, but the wrong kind of account for this page - send them
    // to their own home instead of a dead end.
    return <Navigate to={HOME_BY_ROLE[user.role] || '/login'} replace />;
  }

  return children;
}

export default ProtectedRoute;
