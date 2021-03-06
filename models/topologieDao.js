const debug = require('debug')('millegrilles:maitrecomptes:topologieDao')
// const { verifierSignatureCertificat } = require('@dugrema/millegrilles.common/lib/authentification')
const { validerChaineCertificats, extraireExtensionsMillegrille } = require('@dugrema/millegrilles.common/lib/forgecommon')
const { verifierSignatureMessage } = require('@dugrema/millegrilles.common/lib/validateurMessage')

class TopologieDao {

  constructor(amqDao) {
    this.amqDao = amqDao
    this.idmg = amqDao.pki.idmg
    this.proprietairePresent = false
  }

  getListeApplications = async (params) => {
    /* Recupere la liste d'applications accessible a l'usager. Le certificat
       est utilise pour determiner le niveau d'acces. */

    debug("topologieDao.getListeApplications %O", params)

    // Extraire le niveau de securite du certificat usager
    // delegationGlobale === 3.protege, compte_prive === 2.prive sinon 1.public
    const resultat = await validerChaineCertificats(params['_certificat'])
    const valide = await verifierSignatureMessage(params, resultat.cert)
    const extensions = extraireExtensionsMillegrille(resultat.cert)
    debug("Resultat verification demande apps : %O, valide?%s, ext: %O", resultat, valide, extensions)

    let niveauSecurite = 1,
        roles = extensions.roles || [],
        delegationGlobale = extensions.delegationGlobale || ''

    if(!valide) {
      niveauSecurite = 1
    } else if(['proprietaire', 'delegue'].includes(delegationGlobale)) {
      niveauSecurite = 3
    } else if(roles.includes('compte_prive')) {
      niveauSecurite = 2
    }

    const domaineAction = 'Topologie.listeApplicationsDeployees'
    const requete = {}

    var listeApplications = []
    try {
      debug("Requete info applications securite")
      const listeApplicationsReponse = await this.amqDao.transmettreRequete(
        domaineAction, requete, {decoder: true})

      debug("Reponse applications")
      debug(listeApplicationsReponse)

      listeApplications = listeApplicationsReponse.filter(item=>{
        const securiteApp = Number(item.securite.split('.')[0])
        return securiteApp <= niveauSecurite
      })

    } catch(err) {
      debug("Erreur traitement liste applications\n%O", err)
    }

    return listeApplications

  }

}

// // Fonction qui injecte l'acces aux comptes usagers dans req
// function init(amqDao) {
//   const topologieDao = new Topologie(amqDao)
//
//   const injecterTopologie = async (req, res, next) => {
//     debug("Injection req.topologieDao")
//     req.topologieDao = topologieDao  // Injecte db de comptes
//     next()
//   }
//
//   return {injecterTopologie}
// }

module.exports = {TopologieDao}
