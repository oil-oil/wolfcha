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
   const displayCredits = useMemo(() => {
     if (credits === null || credits === undefined) return "—";
     return `${credits}`;
   }, [credits]);
 
   const handleCopyReferral = async () => {
     if (!referralCode) return;
     try {
       await navigator.clipboard.writeText(referralCode);
       toast("邀请码已复制");
     } catch {
       toast("复制失败", { description: "当前环境不支持剪贴板或权限被拒绝" });
     }
   };
 
   return (
     <Dialog open={open} onOpenChange={onOpenChange}>
       <DialogContent className="max-w-md">
         <DialogHeader>
           <DialogTitle className="flex items-center gap-2">
             <UserCircle size={20} />
             账号信息
           </DialogTitle>
           <DialogDescription>查看账号信息与账户操作</DialogDescription>
         </DialogHeader>
 
         <div className="space-y-4">
           <div className="rounded-lg border-2 border-[var(--border-color)] bg-[var(--bg-card)] p-3 space-y-2 text-sm">
             <div className="flex items-center justify-between">
               <span className="text-[var(--text-muted)]">邮箱</span>
               <span className="text-[var(--text-primary)]">{email ?? "已登录"}</span>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-[var(--text-muted)]">剩余额度</span>
               <span className="text-[var(--text-primary)]">{displayCredits}</span>
             </div>
             <div className="flex items-center justify-between">
               <span className="text-[var(--text-muted)]">邀请人数</span>
               <span className="text-[var(--text-primary)]">{totalReferrals ?? 0}</span>
             </div>
             <div className="flex items-center justify-between gap-3">
               <span className="text-[var(--text-muted)]">邀请码</span>
               <div className="flex items-center gap-2">
                 <span className="text-[var(--text-primary)]">{referralCode ?? "—"}</span>
                 {referralCode && (
                   <button
                     type="button"
                     onClick={handleCopyReferral}
                     className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                     title="复制邀请码"
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
               修改密码
             </Button>
             <Button type="button" variant="outline" onClick={onShareInvite} className="gap-2">
               <ShareNetwork size={16} />
               分享邀请
             </Button>
           </div>
 
           <Button type="button" variant="outline" onClick={onSignOut} className="w-full gap-2">
             <SignOut size={16} />
             退出登录
           </Button>
         </div>
       </DialogContent>
     </Dialog>
   );
 }
