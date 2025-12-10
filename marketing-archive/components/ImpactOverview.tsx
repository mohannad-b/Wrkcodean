import React from 'react';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';
import { ArrowUpRight, TrendingUp, ShieldCheck, Zap, Activity, Layers, CheckCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card';

const COLORS = {
  primary: '#E43632',
  secondary: '#FCA5A5',
  background: '#F5F5F5',
  text: '#0A0A0A',
  grid: '#E5E5E5',
};

// Mock Data
const hoursData = Array.from({ length: 30 }, (_, i) => ({ day: i + 1, value: 120 + Math.random() * 50 + i * 2 }));
const costsData = [
  { week: 'W1', value: 4500 },
  { week: 'W2', value: 5200 },
  { week: 'W3', value: 4800 },
  { week: 'W4', value: 6100 },
];
const unitsData = [
  { name: 'Mon', typeA: 40, typeB: 24, typeC: 24 },
  { name: 'Tue', typeA: 30, typeB: 13, typeC: 22 },
  { name: 'Wed', typeA: 20, typeB: 58, typeC: 22 },
  { name: 'Thu', typeA: 27, typeB: 39, typeC: 20 },
  { name: 'Fri', typeA: 18, typeB: 48, typeC: 21 },
  { name: 'Sat', typeA: 23, typeB: 38, typeC: 25 },
  { name: 'Sun', typeA: 34, typeB: 43, typeC: 21 },
];
const accuracyData = Array.from({ length: 20 }, (_, i) => ({ val: 95 + Math.random() * 5 }));

const reliabilityData = [
  { name: 'Uptime', value: 99.9, color: '#E43632' },
  { name: 'Downtime', value: 0.1, color: '#F5F5F5' },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white p-2 border border-gray-100 shadow-lg rounded-md text-xs">
        <p className="font-bold">{label ? label : ''}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export const ImpactOverview: React.FC = () => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 mb-10">
      
      {/* 1. HOURS SAVED */}
      <Card className="border-gray-100 shadow-sm hover:shadow-md transition-all">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
                <ClockIcon className="w-3 h-3" /> Hours Saved
              </CardTitle>
              <div className="text-3xl font-extrabold text-[#0A0A0A]">3,240h</div>
              <div className="text-xs text-emerald-600 font-bold mt-1 flex items-center">
                <ArrowUpRight size={12} className="mr-1" /> 12.5% vs last month
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="h-[120px] w-full pl-0 pr-2">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <AreaChart data={hoursData}>
              <defs>
                <linearGradient id="colorHours" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#E43632" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#E43632" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <Area type="monotone" dataKey="value" stroke="#E43632" strokeWidth={2} fillOpacity={1} fill="url(#colorHours)" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 2. COST SAVINGS */}
      <Card className="border-gray-100 shadow-sm hover:shadow-md transition-all">
        <CardHeader className="pb-2">
           <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
              <TrendingUp className="w-3 h-3" /> Cost Savings
           </CardTitle>
           <div className="text-3xl font-extrabold text-[#0A0A0A]">$142.5k</div>
           <div className="text-xs text-emerald-600 font-bold mt-1 flex items-center">
             <ArrowUpRight size={12} className="mr-1" /> 8.2% this quarter
           </div>
        </CardHeader>
        <CardContent className="h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={costsData}>
              <Bar dataKey="value" fill="#E43632" radius={[4, 4, 0, 0]} barSize={30} />
              <Tooltip cursor={{fill: 'transparent'}} content={<CustomTooltip />} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 3. EFFICIENCY BOOST */}
      <Card className="border-gray-100 shadow-sm hover:shadow-md transition-all">
        <CardHeader className="pb-2">
           <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Zap className="w-3 h-3" /> Efficiency Boost
           </CardTitle>
           <div className="flex items-end gap-4">
             <div>
               <div className="text-3xl font-extrabold text-[#0A0A0A]">4.5x</div>
               <div className="text-xs text-gray-500 font-medium mt-1">Faster vs Manual</div>
             </div>
           </div>
        </CardHeader>
        <CardContent className="h-[120px] w-full flex items-center justify-center relative">
           {/* Custom Radial Gauge using PieChart */}
           <ResponsiveContainer width="100%" height="160%" minWidth={0} minHeight={0}>
            <PieChart>
              <Pie
                data={[{value: 85}, {value: 15}]}
                cx="50%"
                cy="70%"
                startAngle={180}
                endAngle={0}
                innerRadius={60}
                outerRadius={80}
                paddingAngle={0}
                dataKey="value"
                stroke="none"
              >
                <Cell fill="#E43632" />
                <Cell fill="#F5F5F5" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute bottom-4 text-center">
             <span className="text-2xl font-bold text-[#0A0A0A]">85%</span>
             <p className="text-[10px] text-gray-400 uppercase font-bold">Improvement</p>
          </div>
        </CardContent>
      </Card>

      {/* 4. UNITS OF WORK */}
      <Card className="border-gray-100 shadow-sm hover:shadow-md transition-all">
        <CardHeader className="pb-2">
           <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Layers className="w-3 h-3" /> Units Processed
           </CardTitle>
           <div className="text-3xl font-extrabold text-[#0A0A0A]">24,892</div>
           <div className="text-xs text-gray-500 font-medium mt-1">Across 3 main workflows</div>
        </CardHeader>
        <CardContent className="h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={unitsData}>
              <Bar dataKey="typeA" stackId="a" fill="#E43632" radius={[0, 0, 0, 0]} />
              <Bar dataKey="typeB" stackId="a" fill="#FCA5A5" radius={[0, 0, 0, 0]} />
              <Bar dataKey="typeC" stackId="a" fill="#0A0A0A" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 5. ACCURACY / ERRORS AVOIDED */}
      <Card className="border-gray-100 shadow-sm hover:shadow-md transition-all">
        <CardHeader className="pb-2">
           <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
              <ShieldCheck className="w-3 h-3" /> Accuracy Rate
           </CardTitle>
           <div className="text-3xl font-extrabold text-[#0A0A0A]">99.8%</div>
           <div className="text-xs text-gray-500 font-medium mt-1">1,240 errors auto-resolved</div>
        </CardHeader>
        <CardContent className="h-[120px] w-full">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <LineChart data={accuracyData}>
              <Line type="step" dataKey="val" stroke="#E43632" strokeWidth={2} dot={{ r: 2, fill: '#E43632' }} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* 6. RELIABILITY RATE */}
      <Card className="border-gray-100 shadow-sm hover:shadow-md transition-all">
        <CardHeader className="pb-2">
           <CardTitle className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1 flex items-center gap-2">
              <Activity className="w-3 h-3" /> Reliability
           </CardTitle>
           <div className="text-3xl font-extrabold text-[#0A0A0A]">99.99%</div>
           <div className="text-xs text-emerald-600 font-bold mt-1">Optimal Uptime (30d)</div>
        </CardHeader>
        <CardContent className="h-[120px] w-full flex items-center justify-center gap-6">
           <div className="relative w-24 h-24">
              <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                <PieChart>
                  <Pie
                    data={reliabilityData}
                    cx="50%"
                    cy="50%"
                    innerRadius={30}
                    outerRadius={40}
                    startAngle={90}
                    endAngle={-270}
                    dataKey="value"
                    stroke="none"
                  >
                    {reliabilityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center">
                <CheckCircle className="text-[#E43632] w-6 h-6" />
              </div>
           </div>
           <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#E43632]" />
                <span className="font-medium">Uptime</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-gray-200" />
                <span className="text-gray-500">Maintenance</span>
              </div>
           </div>
        </CardContent>
      </Card>

    </div>
  );
};

// Helper Icon
const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10"></circle>
    <polyline points="12 6 12 12 16 14"></polyline>
  </svg>
);
