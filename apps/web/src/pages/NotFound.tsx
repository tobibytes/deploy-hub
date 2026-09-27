import { useNavigate } from 'react-router-dom';
import { PageHead } from '../layout/Shell.js';
import { Button, Card, EmptyState } from '../ui/kit.js';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <>
      <PageHead title="Not here" />
      <Card>
        <EmptyState
          title="There is nothing at this address"
          text="The page may have moved, or the app may have been deleted."
          action={
            <Button kind="primary" onClick={() => void navigate('/apps')}>
              Go to apps
            </Button>
          }
        />
      </Card>
    </>
  );
}
