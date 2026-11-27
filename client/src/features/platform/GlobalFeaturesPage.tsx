import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { platformService } from '../../services/platformService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function GlobalFeaturesPage() {
  const queryClient = useQueryClient();
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['platform-global-features'],
    queryFn: () => platformService.listGlobalFeatures(),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      platformService.createGlobalFeature({
        key: key.trim().toLowerCase(),
        name: name.trim(),
        category: category.trim() || null,
        description: description.trim() || null,
        isGlobalActive: true,
        isDefaultEnabled: true,
        sortOrder: 100,
      }),
    onSuccess: async () => {
      setKey('');
      setName('');
      setCategory('');
      setDescription('');
      setFormError(null);
      await queryClient.invalidateQueries({ queryKey: ['platform-global-features'] });
    },
    onError: (err) => setFormError(extractApiErrorMessage(err)),
  });

  const toggleMutation = useMutation({
    mutationFn: (payload: { id: string; isGlobalActive: boolean }) =>
      platformService.updateGlobalFeature(payload.id, {
        isGlobalActive: payload.isGlobalActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['platform-global-features'] });
    },
  });

  const handleCreate = (e: FormEvent) => {
    e.preventDefault();
    createMutation.mutate();
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Global Feature Catalog</h1>
        <p className="mt-1 text-sm text-slate-600">
          Database-driven system modules controllable globally and per tenant.
        </p>
      </div>

      <Card title="Add Feature Definition">
        <form onSubmit={handleCreate} className="grid gap-3 sm:grid-cols-4">
          <input
            type="text"
            required
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="feature_key"
            className="rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
          />
          <input
            type="text"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display Name"
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
          />
          <input
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="Category (optional)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
          />
          <Button type="submit" disabled={createMutation.isPending}>
            Add Feature
          </Button>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-4"
          />
        </form>
        {formError && <p className="mt-2 text-xs text-rose-600">{formError}</p>}
      </Card>

      <Card title="Registered System Features">
        <div className="divide-y divide-slate-100">
          {query.data?.map((feat) => (
            <div
              key={feat.id}
              className="flex flex-wrap items-center justify-between gap-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-900">{feat.name}</span>
                  <span className="font-mono text-[11px] text-slate-400">{feat.key}</span>
                  {feat.category && <Badge variant="neutral">{feat.category}</Badge>}
                  <Badge variant={feat.isGlobalActive ? 'success' : 'danger'}>
                    {feat.isGlobalActive ? 'Global Active' : 'Global Inactive'}
                  </Badge>
                </div>
                {feat.description && (
                  <p className="mt-0.5 text-xs text-slate-500">{feat.description}</p>
                )}
              </div>

              <Button
                variant={feat.isGlobalActive ? 'secondary' : 'primary'}
                disabled={toggleMutation.isPending}
                onClick={() =>
                  toggleMutation.mutate({
                    id: feat.id,
                    isGlobalActive: !feat.isGlobalActive,
                  })
                }
              >
                {feat.isGlobalActive ? 'Deactivate Globally' : 'Activate Globally'}
              </Button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
