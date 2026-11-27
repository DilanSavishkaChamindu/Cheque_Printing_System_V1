import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, Plus, Printer, Save } from 'lucide-react';
import {
  inchesToMm,
  mmToInches,
  PERMISSION_CODES,
} from '@cheque-saas/shared';
import { organizationService } from '../../services/organizationService';
import {
  templateService,
  type ChequeTemplateDto,
  type TemplateFieldDto,
} from '../../services/templateService';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { CalibratedChequeRenderer } from '../../components/CalibratedChequeRenderer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function TemplatesPage() {
  const queryClient = useQueryClient();
  const { tenantUser } = useAuthStore();
  const canManage = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.TEMPLATE_MANAGE)
  );

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [unit, setUnit] = useState<'mm' | 'in'>('mm');
  const [selectedFieldKey, setSelectedFieldKey] = useState<string>('PAYEE_NAME');
  const [showGuides, setShowGuides] = useState(true);

  const [newBankId, setNewBankId] = useState('');
  const [newTemplateName, setNewTemplateName] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Local editable draft state for selected template & calibration
  const [draftTemplate, setDraftTemplate] = useState<ChequeTemplateDto | null>(null);
  const [offsetXMm, setOffsetXMm] = useState(0);
  const [offsetYMm, setOffsetYMm] = useState(0);
  const [scalePercent, setScalePercent] = useState(100);
  const [marginTopMm, setMarginTopMm] = useState(0);
  const [marginLeftMm, setMarginLeftMm] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const templatesQuery = useQuery({
    queryKey: ['cheque-templates'],
    queryFn: () => templateService.listTemplates({ page: 1, limit: 50 }),
  });

  const referenceBanksQuery = useQuery({
    queryKey: ['reference-banks-for-templates'],
    queryFn: () => organizationService.listReferenceBanks(),
  });

  useEffect(() => {
    const first = templatesQuery.data?.items[0];
    if (first && !selectedTemplateId) {
      setSelectedTemplateId(first.id);
    }
  }, [templatesQuery.data, selectedTemplateId]);

  useEffect(() => {
    const found = templatesQuery.data?.items.find((t) => t.id === selectedTemplateId);
    if (found) {
      setDraftTemplate(structuredClone(found));
      const prof = found.calibrationProfiles[0];
      setOffsetXMm(prof?.offsetXMm ?? 0);
      setOffsetYMm(prof?.offsetYMm ?? 0);
      setScalePercent(prof?.scalePercent ?? 100);
      setMarginTopMm(prof?.printerMarginTopMm ?? 0);
      setMarginLeftMm(prof?.printerMarginLeftMm ?? 0);
    }
  }, [templatesQuery.data, selectedTemplateId]);

  const createMutation = useMutation({
    mutationFn: () =>
      templateService.createTemplate({
        bankId: newBankId,
        templateName: newTemplateName.trim(),
        paperWidthMm: 178,
        paperHeightMm: 89,
        orientation: 'LANDSCAPE',
        dateFormat: 'DD/MM/YYYY',
        feedDirection: 'TOP_FIRST',
        centerOnA4: false,
        isDefault: false,
      }),
    onSuccess: async (created) => {
      setShowCreateForm(false);
      setNewTemplateName('');
      setSelectedTemplateId(created.id);
      await queryClient.invalidateQueries({ queryKey: ['cheque-templates'] });
    },
    onError: (err) => setErrorMessage(extractApiErrorMessage(err)),
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!draftTemplate) {
        return;
      }
      await templateService.updateTemplate(draftTemplate.id, {
        templateName: draftTemplate.templateName,
        paperWidthMm: draftTemplate.paperWidthMm,
        paperHeightMm: draftTemplate.paperHeightMm,
        orientation: draftTemplate.orientation,
        dateFormat: draftTemplate.dateFormat,
        feedDirection: draftTemplate.feedDirection,
        centerOnA4: draftTemplate.centerOnA4,
        isDefault: draftTemplate.isDefault,
        fields: draftTemplate.fields,
      });

      const activeProfile = draftTemplate.calibrationProfiles[0];
      if (activeProfile) {
        await templateService.updateCalibrationProfile(activeProfile.id, {
          offsetXMm,
          offsetYMm,
          scalePercent,
          printerMarginTopMm: marginTopMm,
          printerMarginLeftMm: marginLeftMm,
        });
      }
    },
    onSuccess: async () => {
      setStatusMessage('Template layout and calibration profile saved.');
      setErrorMessage(null);
      await queryClient.invalidateQueries({ queryKey: ['cheque-templates'] });
    },
    onError: (err) => setErrorMessage(extractApiErrorMessage(err)),
  });

  const duplicateMutation = useMutation({
    mutationFn: () =>
      templateService.duplicateTemplate(
        draftTemplate!.id,
        `${draftTemplate!.templateName} (Copy)`
      ),
    onSuccess: async (copy) => {
      setSelectedTemplateId(copy.id);
      await queryClient.invalidateQueries({ queryKey: ['cheque-templates'] });
    },
  });

  const handleTestPrint = async () => {
    if (!draftTemplate) {
      return;
    }
    const prof = draftTemplate.calibrationProfiles[0];
    if (prof) {
      await templateService.recordTestPrint(prof.id).catch(() => undefined);
    }
    window.print();
  };

  const selectedField = draftTemplate?.fields.find(
    (f) => f.fieldKey === selectedFieldKey
  );

  const updateSelectedField = (patch: Partial<TemplateFieldDto>) => {
    if (!draftTemplate || !selectedField) {
      return;
    }
    setDraftTemplate({
      ...draftTemplate,
      fields: draftTemplate.fields.map((f) =>
        f.fieldKey === selectedField.fieldKey ? { ...f, ...patch } : f
      ),
    });
  };

  const formatMeasure = (mm: number) =>
    unit === 'mm' ? mm : mmToInches(mm);
  const parseMeasure = (raw: string) => {
    const num = Number.parseFloat(raw) || 0;
    return unit === 'mm' ? num : inchesToMm(num);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Cheque Templates &amp; Physical Printer Calibration
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Configure bank-specific millimeter/inch field coordinates, spacing, A4 centering, and printer offset profiles.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={unit}
            onChange={(e) => setUnit(e.target.value as 'mm' | 'in')}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium"
          >
            <option value="mm">Units: Millimeters (mm)</option>
            <option value="in">Units: Inches (in)</option>
          </select>
          {canManage && (
            <Button onClick={() => setShowCreateForm((v) => !v)}>
              <Plus className="h-4 w-4" />
              <span>New Template</span>
            </Button>
          )}
        </div>
      </div>

      {showCreateForm && canManage && (
        <Card title="Create Bank Cheque Template" className="no-print">
          <div className="grid gap-3 sm:grid-cols-3">
            <select
              value={newBankId}
              onChange={(e) => setNewBankId(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            >
              <option value="">Select Bank...</option>
              {referenceBanksQuery.data?.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.bankName} ({b.bankCode})
                </option>
              ))}
            </select>
            <input
              type="text"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
              placeholder="Template Name (e.g. BOC Standard Cheque)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <Button
              disabled={!newBankId || !newTemplateName.trim() || createMutation.isPending}
              onClick={() => createMutation.mutate()}
            >
              Create Template
            </Button>
          </div>
        </Card>
      )}

      {statusMessage && (
        <div className="no-print rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs text-emerald-800">
          {statusMessage}
        </div>
      )}
      {errorMessage && (
        <div className="no-print rounded-lg border border-rose-200 bg-rose-50 px-4 py-2.5 text-xs text-rose-700">
          {errorMessage}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Template Selector List */}
        <div className="no-print space-y-3 lg:col-span-3">
          <Card title="Saved Templates">
            <div className="space-y-2">
              {templatesQuery.data?.items.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedTemplateId(t.id)}
                  className={`w-full rounded-lg border p-3 text-left text-xs transition-colors ${
                    t.id === selectedTemplateId
                      ? 'border-emerald-600 bg-emerald-50/60'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-slate-900">{t.templateName}</span>
                    <Badge variant={t.status === 'ACTIVE' ? 'success' : 'neutral'}>
                      {t.status}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    {t.bank.bankName} · {t.paperWidthMm}×{t.paperHeightMm}mm
                  </p>
                </button>
              ))}
              {!templatesQuery.isLoading && templatesQuery.data?.items.length === 0 && (
                <p className="text-xs text-slate-500">
                  No templates yet. Create your first bank template above.
                </p>
              )}
            </div>
          </Card>
        </div>

        {/* Interactive Calibration Studio */}
        {draftTemplate && (
          <div className="space-y-5 lg:col-span-9">
            <Card
              title={`Calibration Preview — ${draftTemplate.templateName}`}
              subtitle="Click any field box to adjust coordinates, font, or spacing. Run a test print before production use."
              action={
                <div className="no-print flex flex-wrap gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => setShowGuides((v) => !v)}
                  >
                    {showGuides ? 'Hide Grid' : 'Show Grid'}
                  </Button>
                  <Button variant="secondary" onClick={() => void handleTestPrint()}>
                    <Printer className="h-4 w-4" />
                    <span>Test Print</span>
                  </Button>
                  {canManage && (
                    <>
                      <Button
                        variant="secondary"
                        onClick={() => duplicateMutation.mutate()}
                      >
                        <Copy className="h-4 w-4" />
                        <span>Duplicate</span>
                      </Button>
                      <Button
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending}
                      >
                        <Save className="h-4 w-4" />
                        <span>{saveMutation.isPending ? 'Saving...' : 'Save Calibration'}</span>
                      </Button>
                    </>
                  )}
                </div>
              }
            >
              <CalibratedChequeRenderer
                paperWidthMm={draftTemplate.paperWidthMm}
                paperHeightMm={draftTemplate.paperHeightMm}
                dateFormat={draftTemplate.dateFormat}
                centerOnA4={draftTemplate.centerOnA4}
                feedDirection={draftTemplate.feedDirection}
                fields={draftTemplate.fields}
                calibration={{
                  id: 'active',
                  templateId: draftTemplate.id,
                  deviceId: null,
                  profileName: 'Active',
                  offsetXMm,
                  offsetYMm,
                  scalePercent,
                  printerMarginTopMm: marginTopMm,
                  printerMarginLeftMm: marginLeftMm,
                  isDefault: true,
                  lastTestPrintedAt: null,
                }}
                sampleData={{
                  chequeDate: '2026-11-25',
                  payeeName: 'Sample Supplier (Pvt) Ltd',
                  amount: '125000.50',
                  currency: 'LKR',
                  amountInWords:
                    'One Hundred Twenty-Five Thousand Rupees and Fifty Cents Only',
                  paymentType: 'ACCOUNT_PAYEE',
                }}
                selectedFieldKey={selectedFieldKey}
                onSelectField={(key) => setSelectedFieldKey(key)}
                showGuides={showGuides}
              />
            </Card>

            <div className="no-print grid gap-5 lg:grid-cols-2">
              <Card title="Page & Printer Calibration Profile">
                <div className="grid gap-3 sm:grid-cols-2 text-xs">
                  <div>
                    <label className="block font-medium text-slate-700">
                      Paper Width ({unit})
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formatMeasure(draftTemplate.paperWidthMm)}
                      onChange={(e) =>
                        setDraftTemplate({
                          ...draftTemplate,
                          paperWidthMm: parseMeasure(e.target.value),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700">
                      Paper Height ({unit})
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formatMeasure(draftTemplate.paperHeightMm)}
                      onChange={(e) =>
                        setDraftTemplate({
                          ...draftTemplate,
                          paperHeightMm: parseMeasure(e.target.value),
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700">Date Format</label>
                    <select
                      value={draftTemplate.dateFormat}
                      onChange={(e) =>
                        setDraftTemplate({
                          ...draftTemplate,
                          dateFormat: e.target.value as 'DD/MM/YYYY' | 'DDMMYYYY' | 'DD MMM YYYY',
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                    >
                      <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                      <option value="DDMMYYYY">DDMMYYYY</option>
                      <option value="DD MMM YYYY">DD MMM YYYY</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700">Feed Direction</label>
                    <select
                      value={draftTemplate.feedDirection}
                      onChange={(e) =>
                        setDraftTemplate({
                          ...draftTemplate,
                          feedDirection: e.target.value as ChequeTemplateDto['feedDirection'],
                        })
                      }
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                    >
                      <option value="TOP_FIRST">Top First</option>
                      <option value="BOTTOM_FIRST">Bottom First (180°)</option>
                      <option value="LEFT_FIRST">Left First (90°)</option>
                      <option value="RIGHT_FIRST">Right First (270°)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700">
                      Offset X ({unit})
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formatMeasure(offsetXMm)}
                      onChange={(e) => setOffsetXMm(parseMeasure(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700">
                      Offset Y ({unit})
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={formatMeasure(offsetYMm)}
                      onChange={(e) => setOffsetYMm(parseMeasure(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                    />
                  </div>
                  <div>
                    <label className="block font-medium text-slate-700">
                      Print Scale (%)
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      value={scalePercent}
                      onChange={(e) => setScalePercent(Number(e.target.value))}
                      className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                    />
                  </div>
                  <label className="flex items-center gap-2 pt-5">
                    <input
                      type="checkbox"
                      checked={draftTemplate.centerOnA4}
                      onChange={(e) =>
                        setDraftTemplate({
                          ...draftTemplate,
                          centerOnA4: e.target.checked,
                        })
                      }
                    />
                    <span>Center cheque on A4 sheet</span>
                  </label>
                </div>
              </Card>

              <Card
                title={`Field Settings${selectedField ? `: ${selectedField.label}` : ''}`}
              >
                {selectedField ? (
                  <div className="grid gap-3 sm:grid-cols-2 text-xs">
                    <div>
                      <label className="block font-medium text-slate-700">X ({unit})</label>
                      <input
                        type="number"
                        step="0.5"
                        value={formatMeasure(selectedField.xMm)}
                        onChange={(e) =>
                          updateSelectedField({ xMm: parseMeasure(e.target.value) })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700">Y ({unit})</label>
                      <input
                        type="number"
                        step="0.5"
                        value={formatMeasure(selectedField.yMm)}
                        onChange={(e) =>
                          updateSelectedField({ yMm: parseMeasure(e.target.value) })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700">Width ({unit})</label>
                      <input
                        type="number"
                        step="0.5"
                        value={formatMeasure(selectedField.widthMm)}
                        onChange={(e) =>
                          updateSelectedField({ widthMm: parseMeasure(e.target.value) })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700">Font Size (pt)</label>
                      <input
                        type="number"
                        step="0.5"
                        value={selectedField.fontSizePt}
                        onChange={(e) =>
                          updateSelectedField({ fontSizePt: Number(e.target.value) })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700">Alignment</label>
                      <select
                        value={selectedField.textAlign}
                        onChange={(e) =>
                          updateSelectedField({
                            textAlign: e.target.value as 'LEFT' | 'CENTER' | 'RIGHT',
                          })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                      >
                        <option value="LEFT">Left</option>
                        <option value="CENTER">Center</option>
                        <option value="RIGHT">Right</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-medium text-slate-700">Font Weight</label>
                      <select
                        value={selectedField.fontWeight}
                        onChange={(e) =>
                          updateSelectedField({ fontWeight: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                      >
                        <option value="normal">Normal</option>
                        <option value="bold">Bold</option>
                      </select>
                    </div>
                    {selectedField.fieldKey === 'CHEQUE_DATE' && (
                      <div>
                        <label className="block font-medium text-slate-700">
                          Date Digit Gap (mm)
                        </label>
                        <input
                          type="number"
                          step="0.25"
                          value={selectedField.dateDigitGapMm ?? 4.5}
                          onChange={(e) =>
                            updateSelectedField({
                              dateDigitGapMm: Number(e.target.value),
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
                        />
                      </div>
                    )}
                    <label className="flex items-center gap-2 pt-4">
                      <input
                        type="checkbox"
                        checked={selectedField.isVisible}
                        onChange={(e) =>
                          updateSelectedField({ isVisible: e.target.checked })
                        }
                      />
                      <span>Field visible on print output</span>
                    </label>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">
                    Click any field box in the preview to edit its coordinates.
                  </p>
                )}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
