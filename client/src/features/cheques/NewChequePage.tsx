import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  FilePlus2,
  Printer,
  RefreshCw,
  Save,
  WifiOff,
} from 'lucide-react';
import {
  convertAmountToWords,
  FEATURE_KEYS,
  PERMISSION_CODES,
  SUPPORTED_CURRENCIES,
  verifyAmountInWordsMatch,
  type PaymentType,
} from '@cheque-saas/shared';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';
import {
  offlineDb,
  type LocalBankAccountCache,
  type LocalChequeAllocationCache,
  type LocalTemplateCache,
} from '../../lib/offlineDb';
import { chequeService } from '../../services/chequeService';
import { createOfflineChequeDraft } from '../../services/syncEngine';
import { extractApiErrorMessage } from '../../lib/apiClient';
import { useAuthStore } from '../../stores/authStore';
import { ChequePreviewCard } from '../../components/ChequePreviewCard';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';

export function NewChequePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { tenantUser, activeCompanyId } = useAuthStore();
  const companiesEnabled = Boolean(
    tenantUser?.tenant.enabledFeatures.includes(FEATURE_KEYS.COMPANIES)
  );
  const canPrint = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.CHEQUE_PRINT)
  );
  const canManageBooks = Boolean(
    tenantUser?.isClientAdmin ||
      tenantUser?.permissions.includes(PERMISSION_CODES.CHEQUE_BOOK_MANAGE)
  );

  const [selectedCompanyId, setSelectedCompanyId] = useState(
    activeCompanyId ?? tenantUser?.tenant.defaultCompanyId ?? ''
  );
  const [bankAccountId, setBankAccountId] = useState('');
  const [chequeBookId, setChequeBookId] = useState('');
  const [chequeNumber, setChequeNumber] = useState('');
  const [chequeDate, setChequeDate] = useState(new Date().toISOString().slice(0, 10));
  const [dateFormat, setDateFormat] = useState<'DD/MM/YYYY' | 'DDMMYYYY' | 'DD MMM YYYY'>(
    (tenantUser?.tenant.dateFormat as 'DD/MM/YYYY' | 'DDMMYYYY' | 'DD MMM YYYY') || 'DD/MM/YYYY'
  );
  const [payeeName, setPayeeName] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState(tenantUser?.tenant.defaultCurrency ?? 'LKR');
  const [paymentType, setPaymentType] = useState<PaymentType>('ACCOUNT_PAYEE');
  const [cashRecipient, setCashRecipient] = useState('');
  const [amountInWords, setAmountInWords] = useState('');
  const [manualWordsEdited, setManualWordsEdited] = useState(false);
  const [description, setDescription] = useState('');
  const [templateId, setTemplateId] = useState('');

  // Stable idempotency key per cheque draft submission so retries/double-clicks never create duplicates
  const [idempotencyKey, setIdempotencyKey] = useState(() =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `chq-${Date.now()}`
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Quick Cheque Book Modal State
  const [showBookForm, setShowBookForm] = useState(false);
  const [bookName, setBookName] = useState('');
  const [bookPrefix, setBookPrefix] = useState('');
  const [bookStart, setBookStart] = useState('100001');
  const [bookEnd, setBookEnd] = useState('100050');

  const { isOnline, refreshPendingCount } = useOnlineStatus();
  const [offlineAccounts, setOfflineAccounts] = useState<LocalBankAccountCache[]>([]);
  const [offlineAllocations, setOfflineAllocations] = useState<LocalChequeAllocationCache[]>([]);
  const [offlineTemplates, setOfflineTemplates] = useState<LocalTemplateCache[]>([]);

  const loadOfflineCache = useCallback(async () => {
    if (!tenantUser?.tenantId) {
      setOfflineAccounts([]);
      setOfflineAllocations([]);
      setOfflineTemplates([]);
      return;
    }
    const [accts, allocs, tmpls] = await Promise.all([
      offlineDb.cachedBankAccounts.where('tenantId').equals(tenantUser.tenantId).toArray(),
      offlineDb.allocatedChequeRanges.where('tenantId').equals(tenantUser.tenantId).toArray(),
      offlineDb.cachedTemplates.where('tenantId').equals(tenantUser.tenantId).toArray(),
    ]);
    setOfflineAccounts(accts.filter((a) => a.status === 'ACTIVE'));
    setOfflineAllocations(allocs);
    setOfflineTemplates(tmpls);
  }, [tenantUser?.tenantId]);

  useEffect(() => {
    void loadOfflineCache();
  }, [loadOfflineCache, isOnline]);

  const contextQuery = useQuery({
    queryKey: ['cheque-creation-context', companiesEnabled ? selectedCompanyId : 'default'],
    queryFn: () =>
      chequeService.getCreationContext(
        companiesEnabled ? selectedCompanyId || undefined : undefined
      ),
    enabled: isOnline,
  });

  const bankAccounts = useMemo(() => {
    if (isOnline && contextQuery.data?.bankAccounts) {
      return contextQuery.data.bankAccounts;
    }
    return offlineAccounts
      .filter((a) => !companiesEnabled || !selectedCompanyId || a.companyId === selectedCompanyId)
      .map((a) => ({
        id: a.id,
        companyId: a.companyId,
        bankId: a.bankId,
        accountName: a.accountName,
        accountNumberMasked: a.accountNumberMasked,
        currency: a.currency,
        bank: { id: a.bankId, bankName: a.bankName },
      }));
  }, [isOnline, contextQuery.data?.bankAccounts, offlineAccounts, companiesEnabled, selectedCompanyId]);

  const selectedAccount = bankAccounts.find((a) => a.id === bankAccountId);
  const availableBooks = useMemo(
    () =>
      (contextQuery.data?.chequeBooks ?? []).filter(
        (b) => !bankAccountId || b.bankAccountId === bankAccountId
      ),
    [contextQuery.data?.chequeBooks, bankAccountId]
  );
  const selectedBook = availableBooks.find((b) => b.id === chequeBookId);
  const activeOfflineAllocation = useMemo(
    () =>
      offlineAllocations.find(
        (r) =>
          (!bankAccountId || r.bankAccountId === bankAccountId) &&
          r.status === 'ACTIVE' &&
          r.nextNumber <= r.rangeEnd
      ) ?? null,
    [offlineAllocations, bankAccountId]
  );
  const availableTemplates =
    isOnline && contextQuery.data?.templates ? contextQuery.data.templates : offlineTemplates;

  useEffect(() => {
    if (!bankAccountId && bankAccounts[0]) {
      setBankAccountId(bankAccounts[0].id);
      setCurrency(bankAccounts[0].currency);
    }
  }, [bankAccounts, bankAccountId]);

  useEffect(() => {
    if (!isOnline) {
      if (activeOfflineAllocation) {
        const padded = String(activeOfflineAllocation.nextNumber).padStart(
          activeOfflineAllocation.numberPaddingLength,
          '0'
        );
        const formatted = activeOfflineAllocation.chequePrefix
          ? `${activeOfflineAllocation.chequePrefix}${padded}`
          : padded;
        setChequeBookId(activeOfflineAllocation.chequeBookId);
        setChequeNumber(formatted);
      } else {
        setChequeBookId('');
        setChequeNumber('');
      }
      return;
    }

    if (availableBooks[0] && (!selectedBook || selectedBook.bankAccountId !== bankAccountId)) {
      setChequeBookId(availableBooks[0].id);
      setChequeNumber(availableBooks[0].nextChequeNumberFormatted);
    }
  }, [isOnline, activeOfflineAllocation, availableBooks, bankAccountId, selectedBook]);

  // Auto-convert amount to English words unless user intentionally edits
  useEffect(() => {
    if (manualWordsEdited) {
      return;
    }
    if (!amount || !/^\d+(\.\d{1,2})?$/.test(amount.trim()) || Number(amount) <= 0) {
      setAmountInWords('');
      return;
    }
    try {
      setAmountInWords(convertAmountToWords(amount, { currencyCode: currency, locale: 'en' }));
    } catch {
      setAmountInWords('');
    }
  }, [amount, currency, manualWordsEdited]);

  const wordsMatchValid = useMemo(() => {
    if (!amount || !amountInWords) {
      return false;
    }
    try {
      return verifyAmountInWordsMatch(amount, currency, amountInWords, 'en');
    } catch {
      return false;
    }
  }, [amount, currency, amountInWords]);

  const createBookMutation = useMutation({
    mutationFn: () =>
      chequeService.createChequeBook({
        companyId: selectedAccount?.companyId,
        bankAccountId,
        bookName: bookName.trim(),
        chequePrefix: bookPrefix.trim() || null,
        startingNumber: Number(bookStart),
        endingNumber: Number(bookEnd),
        numberPaddingLength: 6,
      }),
    onSuccess: async () => {
      setShowBookForm(false);
      setBookName('');
      await queryClient.invalidateQueries({ queryKey: ['cheque-creation-context'] });
    },
    onError: (err) => setErrorMsg(extractApiErrorMessage(err)),
  });

  const submitCheque = async (mode: 'DRAFT' | 'ISSUE' | 'ISSUE_AND_PRINT') => {
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!wordsMatchValid) {
      setErrorMsg('Amount in words must match the numeric amount and currency.');
      return;
    }

    try {
      if (!isOnline) {
        const result = await createOfflineChequeDraft({
          companyId: companiesEnabled ? selectedCompanyId || undefined : undefined,
          bankAccountId,
          chequeDate,
          dateFormat,
          payeeName: payeeName.trim(),
          amount: amount.trim(),
          currency,
          paymentType,
          cashRecipient: paymentType === 'CASH' ? cashRecipient.trim() || null : null,
          amountInWords: amountInWords.trim(),
          description: description.trim() || null,
        });

        if (mode === 'ISSUE_AND_PRINT') {
          window.print();
        }

        await Promise.all([refreshPendingCount(), loadOfflineCache()]);
        setSuccessMsg(
          `Cheque ${result.draft.chequeNumber} queued offline for synchronization when reconnected.`
        );
        setPayeeName('');
        setAmount('');
        setAmountInWords('');
        setManualWordsEdited(false);
        setDescription('');
        setCashRecipient('');
        return;
      }

      const created = await chequeService.createCheque(
        {
          companyId: companiesEnabled ? selectedCompanyId || undefined : undefined,
          bankAccountId,
          chequeBookId,
          templateId: templateId || null,
          chequeNumber: chequeNumber.trim() || undefined,
          chequeDate,
          dateFormat,
          payeeName: payeeName.trim(),
          amount: amount.trim(),
          currency,
          paymentType,
          cashRecipient: paymentType === 'CASH' ? cashRecipient.trim() || null : null,
          amountInWords: amountInWords.trim(),
          description: description.trim() || null,
          issueImmediately: mode !== 'DRAFT',
          idempotencyKey,
        },
        idempotencyKey
      );

      if (mode === 'ISSUE_AND_PRINT') {
        await chequeService.recordPrintJob(created.id, {
          templateId: templateId || null,
          jobType: 'INITIAL_PRINT',
          status: 'SUCCESS',
        });
        window.print();
      }

      setSuccessMsg(
        `Cheque ${created.chequeNumber} ${mode === 'DRAFT' ? 'saved as draft' : 'issued'} successfully.`
      );
      // Reset form & generate fresh idempotency key for the next cheque
      setPayeeName('');
      setAmount('');
      setAmountInWords('');
      setManualWordsEdited(false);
      setDescription('');
      setCashRecipient('');
      setIdempotencyKey(
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `chq-${Date.now()}`
      );
      await queryClient.invalidateQueries({ queryKey: ['cheque-creation-context'] });
    } catch (err) {
      setErrorMsg(extractApiErrorMessage(err, 'Failed to save cheque.'));
    }
  };

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitCheque('ISSUE');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="no-print flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">New Cheque</h1>
          <p className="mt-1 text-sm text-slate-600">
            Prepare, preview, validate amount-in-words, and issue or print cheques with idempotency protection.
          </p>
        </div>

        <div className="flex gap-2">
          {isOnline && canManageBooks && bankAccountId && (
            <Button variant="secondary" onClick={() => setShowBookForm((v) => !v)}>
              <FilePlus2 className="h-4 w-4" />
              <span>Register Cheque Book</span>
            </Button>
          )}
          <Button variant="secondary" onClick={() => navigate('/cheques/history')}>
            Cheque History
          </Button>
        </div>
      </div>

      {!isOnline && (
        <div className="no-print flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
          <div className="flex items-center gap-2.5">
            <WifiOff className="h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">Offline Cheque Preparation Mode</p>
              <p className="text-amber-800">
                Cheques created offline use pre-allocated device ranges and are queued in IndexedDB for sync when back online.
              </p>
            </div>
          </div>
          <Button variant="secondary" onClick={() => navigate('/sync')}>
            Open Sync Center
          </Button>
        </div>
      )}

      {showBookForm && (
        <Card title="Register New Cheque Book" className="no-print">
          <div className="grid gap-3 sm:grid-cols-5">
            <input
              type="text"
              value={bookName}
              onChange={(e) => setBookName(e.target.value)}
              placeholder="Book Reference (e.g. Main Book 01)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs sm:col-span-2"
            />
            <input
              type="text"
              value={bookPrefix}
              onChange={(e) => setBookPrefix(e.target.value)}
              placeholder="Prefix (optional)"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="number"
              value={bookStart}
              onChange={(e) => setBookStart(e.target.value)}
              placeholder="Start #"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
            <input
              type="number"
              value={bookEnd}
              onChange={(e) => setBookEnd(e.target.value)}
              placeholder="End #"
              className="rounded-lg border border-slate-300 px-3 py-2 text-xs"
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setShowBookForm(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => createBookMutation.mutate()}
              disabled={createBookMutation.isPending}
            >
              Save Cheque Book
            </Button>
          </div>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-12">
        <form onSubmit={handleFormSubmit} className="no-print space-y-5 lg:col-span-7">
          {errorMsg && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-xs text-rose-700">
              {errorMsg}
            </div>
          )}
          {successMsg && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          <Card title="Cheque Details">
            <div className="grid gap-4 sm:grid-cols-2">
              {companiesEnabled && (
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-700">Company *</label>
                  <select
                    required
                    value={selectedCompanyId}
                    onChange={(e) => {
                      setSelectedCompanyId(e.target.value);
                      setBankAccountId('');
                      setChequeBookId('');
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    {tenantUser?.companies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName} ({c.companyCode})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700">Bank Account *</label>
                <select
                  required
                  value={bankAccountId}
                  onChange={(e) => {
                    const nextAcc = bankAccounts.find((a) => a.id === e.target.value);
                    setBankAccountId(e.target.value);
                    setChequeBookId('');
                    if (nextAcc) {
                      setCurrency(nextAcc.currency);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Select Bank Account...</option>
                  {bankAccounts.map((acc) => (
                    <option key={acc.id} value={acc.id}>
                      {acc.bank.bankName} — {acc.accountName} ({acc.accountNumberMasked})
                    </option>
                  ))}
                </select>
              </div>

              {isOnline ? (
                <div>
                  <label className="block text-xs font-medium text-slate-700">Cheque Book *</label>
                  <select
                    required
                    value={chequeBookId}
                    onChange={(e) => {
                      const b = availableBooks.find((item) => item.id === e.target.value);
                      setChequeBookId(e.target.value);
                      if (b) {
                        setChequeNumber(b.nextChequeNumberFormatted);
                      }
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  >
                    <option value="">Select Cheque Book...</option>
                    {availableBooks.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.bookName} ({b.remainingLeaves} leaves left)
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Offline Cheque Range *
                  </label>
                  <div className="mt-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                    {activeOfflineAllocation ? (
                      <span>
                        Allocated #{activeOfflineAllocation.nextNumber}–{activeOfflineAllocation.rangeEnd} (
                        {activeOfflineAllocation.rangeEnd - activeOfflineAllocation.nextNumber + 1} left)
                      </span>
                    ) : (
                      <span className="text-rose-700">
                        No active offline range cached for this account.
                      </span>
                    )}
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700">Cheque Number *</label>
                <input
                  type="text"
                  required
                  readOnly={!isOnline}
                  value={chequeNumber}
                  onChange={(e) => setChequeNumber(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm read-only:bg-slate-50"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Cheque Date *</label>
                <input
                  type="date"
                  required
                  value={chequeDate}
                  onChange={(e) => setChequeDate(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Date Format</label>
                <select
                  value={dateFormat}
                  onChange={(e) =>
                    setDateFormat(e.target.value as 'DD/MM/YYYY' | 'DDMMYYYY' | 'DD MMM YYYY')
                  }
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="DD/MM/YYYY">DD/MM/YYYY</option>
                  <option value="DDMMYYYY">DDMMYYYY</option>
                  <option value="DD MMM YYYY">DD MMM YYYY</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">
                  Print Template (Optional)
                </label>
                <select
                  value={templateId}
                  onChange={(e) => setTemplateId(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">Default Preview Layout</option>
                  {availableTemplates.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.templateName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">Payee Name *</label>
                <input
                  type="text"
                  required
                  value={payeeName}
                  onChange={(e) => setPayeeName(e.target.value)}
                  placeholder="e.g. Ceylon Electricity Board"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Amount *</label>
                <input
                  type="text"
                  required
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setManualWordsEdited(false);
                  }}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm tabular-nums"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  {Object.values(SUPPORTED_CURRENCIES).map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} — {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700">Payment Type *</label>
                <select
                  value={paymentType}
                  onChange={(e) => setPaymentType(e.target.value as PaymentType)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="ACCOUNT_PAYEE">Account Payee</option>
                  <option value="CASH">Cash</option>
                </select>
              </div>

              {paymentType === 'CASH' && (
                <div>
                  <label className="block text-xs font-medium text-slate-700">
                    Cash Recipient (Optional)
                  </label>
                  <input
                    type="text"
                    value={cashRecipient}
                    onChange={(e) => setCashRecipient(e.target.value)}
                    placeholder="Person collecting cash"
                    className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                </div>
              )}

              <div className="sm:col-span-2">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-medium text-slate-700">
                    Amount in Words *
                  </label>
                  <div className="flex items-center gap-2">
                    {amount && (
                      <Badge variant={wordsMatchValid ? 'success' : 'danger'}>
                        {wordsMatchValid ? 'Matches Numeric Amount' : 'Mismatch'}
                      </Badge>
                    )}
                    {manualWordsEdited && (
                      <button
                        type="button"
                        onClick={() => setManualWordsEdited(false)}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700"
                      >
                        <RefreshCw className="h-3 w-3" />
                        <span>Auto-Generate</span>
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  rows={2}
                  required
                  value={amountInWords}
                  onChange={(e) => {
                    setAmountInWords(e.target.value);
                    setManualWordsEdited(true);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-medium text-slate-700">
                  Description / Note (Optional)
                </label>
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Invoice reference or internal memo"
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2.5 border-t border-slate-200 pt-4">
              {isOnline && (
                <Button
                  variant="secondary"
                  type="button"
                  onClick={() => void submitCheque('DRAFT')}
                >
                  <Save className="h-4 w-4" />
                  <span>Save Draft</span>
                </Button>
              )}
              <Button type="submit" disabled={!isOnline && !activeOfflineAllocation}>
                <span>{isOnline ? 'Save & Issue' : 'Queue Offline Cheque'}</span>
              </Button>
              {canPrint && (
                <Button
                  type="button"
                  variant="primary"
                  disabled={!isOnline && !activeOfflineAllocation}
                  className="bg-emerald-700 hover:bg-emerald-600"
                  onClick={() => void submitCheque('ISSUE_AND_PRINT')}
                >
                  <Printer className="h-4 w-4" />
                  <span>{isOnline ? 'Save & Print' : 'Queue & Print Offline'}</span>
                </Button>
              )}
            </div>
          </Card>
        </form>

        <div className="space-y-4 lg:col-span-5">
          <Card title="Realistic Cheque Preview" subtitle="Updates live as you type">
            <ChequePreviewCard
              bankName={selectedAccount?.bank.bankName ?? 'Bank Preview'}
              accountName={selectedAccount?.accountName}
              accountNumberMasked={selectedAccount?.accountNumberMasked}
              chequeNumber={chequeNumber}
              chequeDate={chequeDate}
              dateFormat={dateFormat}
              payeeName={payeeName}
              amount={amount}
              currency={currency}
              amountInWords={amountInWords}
              paymentType={paymentType}
              cashRecipient={cashRecipient}
            />
          </Card>
        </div>
      </div>
    </div>
  );
}
