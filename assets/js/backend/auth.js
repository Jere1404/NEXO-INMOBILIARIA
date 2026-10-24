// No signup or role-management methods: access is provisioned out of band.
export function createAdminAuth(client) {
  async function getCurrentAdmin() {
    const { data, error } = await client.auth.getUser();
    if (error || !data?.user) return null;
    const membership = await client.from('admin_memberships').select('user_id,role,enabled').eq('user_id', data.user.id).maybeSingle();
    if (membership.error) throw new Error('No se pudo verificar el permiso de administración.');
    return membership.data?.enabled && membership.data.role === 'admin' ? data.user : null;
  }
  return {
    getCurrentAdmin,
    async signIn(email, password) {
      const response = await client.auth.signInWithPassword({ email, password });
      if (response.error) throw new Error('No se pudo iniciar sesión. Revisá tus datos de acceso.');
      try {
        const user = await getCurrentAdmin();
        if (!user) throw new Error('La cuenta no está autorizada para administrar NEXO.');
        return user;
      } catch (error) { await client.auth.signOut(); throw error; }
    },
    async signOut() {
      const result = await client.auth.signOut();
      if (result.error) throw new Error('No se pudo cerrar la sesión.');
    },
  };
}
