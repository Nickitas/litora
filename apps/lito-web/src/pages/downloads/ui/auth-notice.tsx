import { downloadsPageContent } from "../constants";

export const AuthNotice = () => {
  const { authNotice } = downloadsPageContent;

  return (
    <div className="rounded-lg border border-warning/30 bg-warning-background p-4 sm:p-6">
      <p className="text-sm text-warning">
        <strong>{authNotice.title}:</strong> {authNotice.content}
      </p>
    </div>
  );
};
