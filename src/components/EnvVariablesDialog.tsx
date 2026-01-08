import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Plus, Trash2, Loader2, RotateCw } from 'lucide-react';
import { backendAPI } from '@/lib/backend-api';
import { toast } from 'sonner';

interface EnvVariable {
  key: string;
  value: string;
}

interface EnvVariablesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  containerId: string;
  containerName: string;
  onSaved?: () => void;
}

export default function EnvVariablesDialog({
  open,
  onOpenChange,
  containerId,
  containerName,
  onSaved,
}: EnvVariablesDialogProps) {
  const [envVars, setEnvVars] = useState<EnvVariable[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newValue, setNewValue] = useState('');

  useEffect(() => {
    if (open) {
      loadEnvVariables();
    }
  }, [open, containerId]);

  const loadEnvVariables = async () => {
    setIsLoading(true);
    try {
      const data = await backendAPI.getContainerEnvironmentVariables(containerId);
      const vars = Object.entries(data.environmentVariables || {}).map(([key, value]) => ({
        key,
        value: String(value),
      }));
      setEnvVars(vars);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to load environment variables'
      );
      setEnvVars([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddVariable = () => {
    if (!newKey.trim()) {
      toast.error('Variable name cannot be empty');
      return;
    }

    if (envVars.some((v) => v.key === newKey)) {
      toast.error('Variable already exists');
      return;
    }

    setEnvVars([...envVars, { key: newKey, value: newValue }]);
    setNewKey('');
    setNewValue('');
  };

  const handleRemoveVariable = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleUpdateVariable = (index: number, field: 'key' | 'value', newVal: string) => {
    const updated = [...envVars];
    updated[index][field] = newVal;
    setEnvVars(updated);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // Convert array to object
      const envVarObject = envVars.reduce((acc, { key, value }) => {
        acc[key] = value;
        return acc;
      }, {} as Record<string, string>);

      const result = await backendAPI.updateContainerEnvironmentVariables(
        containerId,
        envVarObject
      );

      toast.success('Environment variables updated! Container is being restarted...');
      onOpenChange(false);
      
      // Refresh the parent component's data to get the new container ID
      if (onSaved) {
        onSaved();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update environment variables');
    } finally {
      setIsSaving(false);
    }
  };

  const handleRefresh = () => {
    loadEnvVariables();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Environment Variables - {containerName}</DialogTitle>
          <DialogDescription>
            Add, edit, or remove environment variables. Changes will trigger a container restart.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Current Variables */}
              <div className="space-y-2">
                <Label className="text-sm font-semibold">Current Variables</Label>
                <div className="max-h-64 space-y-2 overflow-y-auto">
                  {envVars.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-4 text-center">
                      No environment variables set yet
                    </p>
                  ) : (
                    envVars.map((envVar, index) => (
                      <Card key={index} className="p-3 flex items-end gap-2">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Variable Name</Label>
                          <Input
                            value={envVar.key}
                            onChange={(e) =>
                              handleUpdateVariable(index, 'key', e.target.value)
                            }
                            placeholder="VAR_NAME"
                            className="mt-1"
                          />
                        </div>
                        <div className="flex-[2]">
                          <Label className="text-xs text-muted-foreground">Value</Label>
                          <Input
                            value={envVar.value}
                            onChange={(e) =>
                              handleUpdateVariable(index, 'value', e.target.value)
                            }
                            placeholder="value"
                            type="password"
                            className="mt-1"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveVariable(index)}
                          className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </Card>
                    ))
                  )}
                </div>
              </div>

              {/* Add New Variable */}
              <div className="border-t pt-4">
                <Label className="text-sm font-semibold">Add New Variable</Label>
                <div className="mt-3 flex gap-2">
                  <div className="flex-1">
                    <Input
                      value={newKey}
                      onChange={(e) => setNewKey(e.target.value)}
                      placeholder="Variable name"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAddVariable();
                        }
                      }}
                    />
                  </div>
                  <div className="flex-[2]">
                    <Input
                      value={newValue}
                      onChange={(e) => setNewValue(e.target.value)}
                      placeholder="Value"
                      type="password"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          handleAddVariable();
                        }
                      }}
                    />
                  </div>
                  <Button
                    onClick={handleAddVariable}
                    variant="outline"
                    size="sm"
                    className="gap-2"
                  >
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              </div>
            </>
          )}

          {/* Actions */}
          <div className="flex gap-2 justify-end border-t pt-4">
            <Button
              variant="outline"
              onClick={handleRefresh}
              disabled={isLoading || isSaving}
              className="gap-2"
            >
              <RotateCw className="h-4 w-4" />
              Reload
            </Button>
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving || isLoading}
              className="gap-2"
            >
              {isSaving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save & Restart
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
