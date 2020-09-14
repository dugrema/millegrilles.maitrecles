const debug = require('debug')('millegrilles:maitrecomptes:maitreClesDao')

class MaitreClesDao {

  constructor(amqDao) {
    this.amqDao = amqDao
    this.idmg = amqDao.pki.idmg
  }

  // getListeApplications = async (securite) => {
  //
  //   const domaineAction = 'Topologie.listeApplicationsDeployees'
  //   const requete = { securite }
  //
  //   var listeApplications = []
  //   try {
  //     debug("Requete info applications securite %s", securite)
  //     listeApplications = await this.amqDao.transmettreRequete(
  //       domaineAction, requete, {decoder: true})
  //
  //     debug("Reponse applications")
  //     debug(listeApplications)
  //
  //     // Trier
  //     listeApplications.sort((a,b)=>{
  //       return a.application.localeCompare(b.application)
  //     })
  //   } catch(err) {
  //     debug("Erreur traitement liste applications\n%O", err)
  //   }
  //
  //   return listeApplications
  //
  // }

  signerCertificatNavigateur = async (csr, nomUsager, estProprietaire) => {

    const domaineAction = 'MaitreDesCles.signerNavigateurCsr'
    const params = {
      csr, nomUsager, estProprietaire
    }

    try {
      debug("Commande signature certificat navigateur %O", params)
      const reponse = await this.amqDao.transmettreCommande(domaineAction, params, {decoder: true})
      debug("Reponse commande signature certificat : %O", reponse)
      return reponse.resultats
    } catch(err) {
      debug("Erreur traitement liste applications\n%O", err)
    }

    return null
  }

}

// Fonction qui injecte l'acces aux comptes usagers dans req
function init(amqDao) {
  const maitreClesDao = new MaitreClesDao(amqDao)

  const injecterMaitreCles = async (req, res, next) => {
    debug("Injection req.maitreClesDao")
    req.maitreClesDao = maitreClesDao  // Injecte db de comptes
    next()
  }

  return {injecterMaitreCles}
}

module.exports = {init}
