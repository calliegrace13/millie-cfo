import { useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Contacts as CapContacts } from '@capacitor-community/contacts';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/hooks/use-toast';

export function useImportContacts() {
  const { user } = useAuth();
  const [importing, setImporting] = useState(false);
  const [importCount, setImportCount] = useState(0);

  const isNative = Capacitor.isNativePlatform();

  const importContacts = async () => {
    if (!user) return;
    if (!isNative) {
      toast({ title: 'Native app required', description: 'Contact import is available when using the installed app on your iPhone.', variant: 'destructive' });
      return;
    }

    setImporting(true);
    setImportCount(0);

    try {
      const permission = await CapContacts.requestPermissions();
      if (permission.contacts !== 'granted') {
        toast({ title: 'Permission denied', description: 'Please allow contact access in your device settings.', variant: 'destructive' });
        return;
      }

      const result = await CapContacts.getContacts({
        projection: {
          name: true,
          phones: true,
          emails: true,
          birthday: true,
          organization: true,
        },
      });

      const contacts = result.contacts || [];
      if (contacts.length === 0) {
        toast({ title: 'No contacts found' });
        return;
      }

      // Build upsert rows
      const rows = contacts
        .filter(c => c.name?.display || c.name?.given || c.name?.family)
        .map(c => ({
          user_id: user.id,
          native_contact_id: c.contactId || null,
          first_name: c.name?.given || null,
          last_name: c.name?.family || null,
          display_name: c.name?.display || [c.name?.given, c.name?.family].filter(Boolean).join(' ') || 'Unknown',
          phone: c.phones?.[0]?.number || null,
          email: c.emails?.[0]?.address || null,
          birthday: c.birthday?.year
            ? `${c.birthday.year}-${String(c.birthday.month ?? 1).padStart(2, '0')}-${String(c.birthday.day ?? 1).padStart(2, '0')}`
            : c.birthday?.month
              ? `--${String(c.birthday.month).padStart(2, '0')}-${String(c.birthday.day ?? 1).padStart(2, '0')}`
              : null,
          organization: (c.organization as any)?.name || (c.organization as any)?.company || null,
        }));

      // Batch upsert in chunks
      const CHUNK = 100;
      let imported = 0;
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK);
        const { error } = await supabase.from('contacts').upsert(chunk as any, {
          onConflict: 'user_id,native_contact_id',
          ignoreDuplicates: false,
        });
        if (error) {
          console.error('Chunk insert error:', error);
          // Fall back to individual inserts for this chunk
          for (const row of chunk) {
            if (row.native_contact_id) {
              const { error: singleErr } = await supabase.from('contacts').upsert(row as any, {
                onConflict: 'user_id,native_contact_id',
                ignoreDuplicates: false,
              });
              if (!singleErr) imported++;
            } else {
              const { error: insertErr } = await supabase.from('contacts').insert(row as any);
              if (!insertErr) imported++;
            }
          }
        } else {
          imported += chunk.length;
        }
        setImportCount(imported);
      }

      toast({ title: `Imported ${imported} contacts` });
    } catch (e: any) {
      console.error('Import error:', e);
      toast({ title: 'Import failed', description: e.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  return { importContacts, importing, importCount, isNative };
}
