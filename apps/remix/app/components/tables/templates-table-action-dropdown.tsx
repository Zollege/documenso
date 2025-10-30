import { useState } from 'react';

import { msg } from '@lingui/core/macro';
import { useLingui } from '@lingui/react';
import { Trans } from '@lingui/react/macro';
import type { Recipient, TemplateDirectLink } from '@prisma/client';
import {
  Copy,
  Download,
  Edit,
  FolderIcon,
  MoreHorizontal,
  Share2Icon,
  Trash2,
  Upload,
} from 'lucide-react';
import { Link } from 'react-router';

import { downloadPDF } from '@documenso/lib/client-only/download-pdf';
import { useSession } from '@documenso/lib/client-only/providers/session';
import { trpc } from '@documenso/trpc/react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@documenso/ui/primitives/dropdown-menu';
import { useToast } from '@documenso/ui/primitives/use-toast';

import { TemplateBulkSendDialog } from '../dialogs/template-bulk-send-dialog';
import { TemplateDeleteDialog } from '../dialogs/template-delete-dialog';
import { TemplateDirectLinkDialog } from '../dialogs/template-direct-link-dialog';
import { TemplateDuplicateDialog } from '../dialogs/template-duplicate-dialog';
import { TemplateMoveToFolderDialog } from '../dialogs/template-move-to-folder-dialog';

export type TemplatesTableActionDropdownProps = {
  row: {
    id: number;
    userId: number;
    teamId: number;
    title: string;
    folderId?: string | null;
    envelopeId: string;
    directLink?: Pick<TemplateDirectLink, 'token' | 'enabled'> | null;
    recipients: Recipient[];
  };
  templateRootPath: string;
  teamId: number;
  onDelete?: () => Promise<void> | void;
};

export const TemplatesTableActionDropdown = ({
  row,
  templateRootPath,
  teamId,
  onDelete,
}: TemplatesTableActionDropdownProps) => {
  const { _ } = useLingui();
  const { user } = useSession();
  const { toast } = useToast();

  const utils = trpc.useUtils();

  const [isDeleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isDuplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [isMoveToFolderDialogOpen, setMoveToFolderDialogOpen] = useState(false);

  const isOwner = row.userId === user.id;
  const isTeamTemplate = row.teamId === teamId;

  const formatPath = `${templateRootPath}/${row.envelopeId}/edit`;

  const onDownloadClick = async () => {
    try {
      const template = await utils.template.getTemplateById.fetch({
        templateId: row.id,
      });

      const documentData = template?.templateDocumentData;

      if (!documentData) {
        return;
      }

      await downloadPDF({
        documentData,
        fileName: row.title,
        version: 'original',
      });
    } catch (err) {
      toast({
        title: _(msg`Something went wrong`),
        description: _(msg`An error occurred while downloading your template.`),
        variant: 'destructive',
      });
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger data-testid="template-table-action-btn">
        <MoreHorizontal className="text-muted-foreground h-5 w-5" />
      </DropdownMenuTrigger>

      <DropdownMenuContent className="w-52" align="start" forceMount>
        <DropdownMenuLabel>Action</DropdownMenuLabel>

        <DropdownMenuItem disabled={!isOwner && !isTeamTemplate} asChild>
          <Link to={formatPath}>
            <Edit className="mr-2 h-4 w-4" />
            <Trans>Edit</Trans>
          </Link>
        </DropdownMenuItem>

        <DropdownMenuItem
          disabled={!isOwner && !isTeamTemplate}
          onClick={() => setDuplicateDialogOpen(true)}
        >
          <Copy className="mr-2 h-4 w-4" />
          <Trans>Duplicate</Trans>
        </DropdownMenuItem>

        <DropdownMenuItem onClick={onDownloadClick}>
          <Download className="mr-2 h-4 w-4" />
          <Trans>Download</Trans>
        </DropdownMenuItem>

        <TemplateDirectLinkDialog
          templateId={row.id}
          recipients={row.recipients}
          directLink={row.directLink}
          trigger={
            <div
              data-testid="template-direct-link"
              className="hover:bg-accent hover:text-accent-foreground relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors"
            >
              <Share2Icon className="mr-2 h-4 w-4" />
              <Trans>Direct link</Trans>
            </div>
          }
        />

        <DropdownMenuItem onClick={() => setMoveToFolderDialogOpen(true)}>
          <FolderIcon className="mr-2 h-4 w-4" />
          <Trans>Move to Folder</Trans>
        </DropdownMenuItem>

        <TemplateBulkSendDialog
          templateId={row.id}
          recipients={row.recipients}
          trigger={
            <div className="hover:bg-accent hover:text-accent-foreground relative flex cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors">
              <Upload className="mr-2 h-4 w-4" />
              <Trans>Bulk Send via CSV</Trans>
            </div>
          }
        />

        <DropdownMenuItem
          disabled={!isOwner && !isTeamTemplate}
          onClick={() => setDeleteDialogOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          <Trans>Delete</Trans>
        </DropdownMenuItem>
      </DropdownMenuContent>

      <TemplateDuplicateDialog
        id={row.id}
        open={isDuplicateDialogOpen}
        onOpenChange={setDuplicateDialogOpen}
      />

      <TemplateDeleteDialog
        id={row.id}
        open={isDeleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onDelete={onDelete}
      />

      <TemplateMoveToFolderDialog
        templateId={row.id}
        templateTitle={row.title}
        isOpen={isMoveToFolderDialogOpen}
        onOpenChange={setMoveToFolderDialogOpen}
        currentFolderId={row.folderId}
      />
    </DropdownMenu>
  );
};
