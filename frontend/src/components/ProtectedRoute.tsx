import { Navigate } from 'react-router-dom';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

export function PublicRoute({ children }: ProtectedRouteProps) {
  const isAuthenticated = localStorage.getItem('isAuthenticated') === 'true';
  
  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }
  
  return <>{children}</>;
}
