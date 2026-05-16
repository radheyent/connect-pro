import React, { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { Briefcase, Loader2 } from 'lucide-react';

const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.session) {
        toast.success('Login successful!');
        navigate('/');
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to login');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-900 p-4 font-sans relative overflow-hidden">
      {/* Abstract Background Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-600/10 rounded-full blur-3xl"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/5 rounded-full blur-3xl"></div>
      
      <Card className="w-full max-w-md bg-white border-slate-200 shadow-2xl rounded-2xl overflow-hidden z-10 ring-1 ring-white/10">
        <CardHeader className="space-y-1 text-center pb-8 pt-10 px-8">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center font-bold text-3xl italic text-white shadow-xl shadow-blue-500/20 transform -rotate-3">
              C+
            </div>
          </div>
          <CardTitle className="text-3xl font-black text-slate-900 tracking-tight">Connect Pro</CardTitle>
          <CardDescription className="text-slate-500 font-medium pt-2">
            Secure Enterprise Lead Management
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleLogin}>
          <CardContent className="space-y-5 px-8">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Corporate Email</Label>
              <div className="relative">
                <Input 
                  id="email" 
                  type="email" 
                  placeholder="name@company.com" 
                  className="bg-slate-50 border-slate-200 focus:bg-white transition-all h-11 pl-4 rounded-xl"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required 
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="password" className="text-[10px] font-bold text-slate-400 uppercase tracking-widest pl-1">Access Key</Label>
              <Input 
                id="password" 
                type="password" 
                className="bg-slate-50 border-slate-200 focus:bg-white transition-all h-11 pl-4 rounded-xl"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required 
              />
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <Checkbox 
                id="remember" 
                checked={rememberMe}
                onCheckedChange={(checked) => setRememberMe(!!checked)}
                className="rounded-md border-slate-300 data-[state=checked]:bg-blue-600"
              />
              <label 
                htmlFor="remember" 
                className="text-xs font-semibold text-slate-500 cursor-pointer select-none"
              >
                Keep me logged in for 30 days
              </label>
            </div>
          </CardContent>
          <CardFooter className="p-8 pt-4">
            <Button className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-lg transition-all active:scale-[0.98]" type="submit" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : 'AUTHENTICATE'}
            </Button>
          </CardFooter>
        </form>
        <div className="px-8 pb-8 text-center text-[10px] text-slate-400 font-medium uppercase tracking-tighter">
          &copy; 2026 Connect Pro Systems &bull; v2.4.0-release
        </div>
      </Card>
    </div>
  );
};

export default LoginPage;
