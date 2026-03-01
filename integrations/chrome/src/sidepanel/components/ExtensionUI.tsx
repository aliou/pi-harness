import type { ActiveDialog } from "../types";
import { ConfirmDialog } from "./dialogs/ConfirmDialog";
import { InputDialog } from "./dialogs/InputDialog";
import { SelectDialog } from "./dialogs/SelectDialog";

interface ExtensionUIProps {
  dialog: ActiveDialog | null;
  onRespond: (response: {
    value?: string;
    confirmed?: boolean;
    cancelled?: boolean;
  }) => void;
}

export function ExtensionUI({ dialog, onRespond }: ExtensionUIProps) {
  if (!dialog) return null;

  const cancel = () => onRespond({ cancelled: true });
  const { request } = dialog;

  let content: React.ReactNode = null;

  switch (request.method) {
    case "select":
      content = (
        <SelectDialog
          title={request.title}
          options={request.options ?? []}
          onSelect={(v) => onRespond({ value: v })}
          onCancel={cancel}
        />
      );
      break;
    case "confirm":
      content = (
        <ConfirmDialog
          title={request.title}
          message={request.message}
          onConfirm={() => onRespond({ confirmed: true })}
          onCancel={cancel}
        />
      );
      break;
    case "input":
      content = (
        <InputDialog
          title={request.title}
          placeholder={request.placeholder}
          prefill={request.prefill}
          onSubmit={(v) => onRespond({ value: v })}
          onCancel={cancel}
        />
      );
      break;
    default:
      return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-lg p-4 mx-4 w-full max-w-sm">
        {content}
      </div>
    </div>
  );
}
