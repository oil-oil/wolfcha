"use client";
 
import { useMemo } from "react";
 import { UserCircle, Key, SignOut, ShareNetwork, Copy } from "@phosphor-icons/react";
 import {
   Dialog,
   DialogContent,
   DialogDescription,
   DialogHeader,
   DialogTitle,
 } from "@/components/ui/dialog";
 import { Button } from "@/components/ui/button";
 import { toast } from "sonner";
import { useTranslations } from "next-intl";
 
 interface UserProfileModalProps {
   open: boolean;
   onOpenChange: (open: boolean) => void;
   email?: string | null;
   credits?: number | null;
   referralCode?: string | null;
   totalReferrals?: number | null;
   onChangePassword: () => void;
   onShareInvite: () => void;
   onSignOut: () => void;
 }
 
 export function UserProfileModal({
   open,
   onOpenChange,
   email,
   credits,
   referralCode,
   totalReferrals,
   onChangePassword,
   onShareInvite,
   onSignOut,
 }: UserProfileModalProps) {
  const t = useTranslations();
   const displayCredits = useMemo(() => {
    if (credits === null || credits === undefined) return t("userProfile.empty");
     return `${credits}`;
  }, [credits, t]);
 
   const handleCopyReferral = async () => {
     if (!referralCode) return;
     try {
       await navigator.clipboard.writeText(referralCode);
      toast(t("userProfile.toasts.copySuccess"));
     } catch {
      toast(t("userProfile.toasts.copyFail.title"), {
        description: t("userProfile.toasts.copyFail.description"),
      });
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-md">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <UserCircle size={20} />
            {t("userProfile.title")}
           </DialogTitle>
          <DialogDescription>{t("userProfile.description")}</DialogDescription>
         </DialogHeader>
 
         <div className="space-y-4">
           <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3 space-y-2 text-sm">
             <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">{t("userProfile.fields.email")}</span>
              <span className="text-[var(--text-primary)]">{email ?? t("userProfile.loggedIn")}</span>
             </div>
             <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">{t("userProfile.fields.credits")}</span>
               <span className="text-[var(--text-primary)]">{displayCredits}</span>
             </div>
             <div className="flex items-center justify-between">
              <span className="text-[var(--text-muted)]">{t("userProfile.fields.referrals")}</span>
               <span className="text-[var(--text-primary)]">{totalReferrals ?? 0}</span>
             </div>
             <div className="flex items-center justify-between gap-3">
              <span className="text-[var(--text-muted)]">{t("userProfile.fields.referralCode")}</span>
               <div className="flex items-center gap-2">
                <span className="text-[var(--text-primary)]">{referralCode ?? t("userProfile.empty")}</span>
                 {referralCode && (
                   <button
                     type="button"
                     onClick={handleCopyReferral}
                     className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                    title={t("userProfile.actions.copy")}
                   >
                     <Copy size={14} />
                   </button>
                 )}
               </div>
             </div>
           </div>
 
           <div className="grid grid-cols-2 gap-2">
             <Button type="button" variant="outline" onClick={onChangePassword} className="gap-2">
               <Key size={16} />
              {t("userProfile.actions.changePassword")}
             </Button>
             <Button type="button" variant="outline" onClick={onShareInvite} className="gap-2">
               <ShareNetwork size={16} />
              {t("userProfile.actions.shareInvite")}
             </Button>
           </div>
 
           <Button type="button" variant="outline" onClick={onSignOut} className="w-full gap-2">
             <SignOut size={16} />
            {t("userProfile.actions.signOut")}
           </Button>
         </div>
       </DialogContent>
     </Dialog>
   );
 }
