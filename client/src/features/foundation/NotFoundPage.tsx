import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-xl py-12">
      <EmptyState
        icon={<FileQuestion className="h-5 w-5" />}
        title="Page not found"
        description="The requested route does not exist or is not yet enabled for your organization."
        action={
          <Link to="/">
            <Button variant="primary">Return to System Status</Button>
          </Link>
        }
      />
    </div>
  );
}
